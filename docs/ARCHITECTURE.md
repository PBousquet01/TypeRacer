# Architecture

Chocobo Race est une course de frappe multijoueur : tout le monde tape le même
texte, et le chocobo de chaque joueur avance au rythme de sa frappe.

Ce document décrit l'application telle qu'elle est aujourd'hui, et ce qui est
prévu là où c'est indiqué. Il contient :

1. [Vue d'ensemble](#vue-densemble)
2. [Pile technologique](#pile-technologique)
3. [Modèle de données](#modèle-de-données)
4. [Machine à états d'une course (COURSE-01)](#machine-à-états-dune-course-course-01)
5. [Flux des messages temps réel](#flux-des-messages-temps-réel)
6. [ADR-001 : technologie temps réel](#adr-001--technologie-temps-réel)
7. [ADR-002 : gestion des bots](#adr-002--gestion-des-bots)
8. [Sécurité](#sécurité), [langues](#langues-i18n-01), [tests](#tests-et-intégration-continue-tech-09), [installation](#installation)

## Vue d'ensemble

```mermaid
flowchart LR
    subgraph Navigateur
        P["Pages Next.js / React<br/>(app/, components/)"]
        E["Moteur de frappe<br/>(lib/typing.ts)"]
    end
    subgraph Serveur["Un seul processus Bun (server.ts)"]
        N["Next.js<br/>(pages)"]
        A["API JSON<br/>(server/api.ts)"]
        R["Arbitre des courses<br/>(server/rooms.ts)"]
    end
    DB[("PostgreSQL")]

    P -- "HTTP : pages" --> N
    P -- "HTTP : /api/*" --> A
    P <-- "WebSocket (Socket.IO)" --> R
    E --> P
    A --> DB
    R --> DB
```

- **Un seul processus** (`server.ts`) sert à la fois les pages Next.js, l'API
  `/api/*` et les WebSockets. C'est pour ça qu'on lance toujours `bun run dev`
  et jamais `next dev`.
- **Le serveur est l'arbitre** (COURSE-06). Le navigateur n'envoie que les
  touches tapées. Positions, précision, ordre d'arrivée, MPM et places sont
  décidés par `server/rooms.ts`.
- Les salles vivent **en mémoire** (une course dure quelques minutes); ce qui
  doit survivre à un redémarrage (comptes, sessions, résultats, textes) est
  dans PostgreSQL.

### Organisation du code

| Dossier / fichier | Rôle |
| --- | --- |
| `server.ts` | Démarre Next.js + Socket.IO sur un seul port; associe la session (cookie) à chaque socket |
| `server/rooms.ts` | L'arbitre : salles, rôles, compte à rebours, positions, arrivée, classement, anti-triche |
| `server/api.ts` | API JSON (`/api/*`) : comptes, textes, statistiques, admin |
| `server/auth.ts`, `server/oauth.ts` | Comptes et sessions (argon2id, jeton aléatoire, cookie HttpOnly); connexion GitHub et Discord |
| `server/db.ts` | Connexion PostgreSQL, création du schéma, remplissage de la banque de textes |
| `server/texts.ts` | Tire un texte de la banque (passages ou mots au hasard) |
| `server/seed/` | Passages et dictionnaires de départ, versés dans la base au premier démarrage |
| `lib/types.ts` | Types partagés serveur/navigateur : salle, joueur, événements Socket.IO, codes d'erreur |
| `lib/rules.ts` | Règles partagées : nombre de joueurs, délais, formule du score |
| `lib/typing.ts` | Règles du moteur de frappe, en fonctions pures (testées) |
| `lib/i18n/` | Dictionnaires français et anglais de l'interface |
| `hooks/` | `useTypingEngine` (état de la frappe), `useRoom` (événements de la salle → état React) |
| `app/`, `components/` | Pages et composants d'interface |
| `tests/` | Tests automatisés |
| `scripts/admin.ts` | Outil en ligne de commande : comptes, montures, banque de textes |

## Pile technologique

| Besoin | Choix | Pourquoi |
| --- | --- | --- |
| Framework web (TECH-01, TECH-02) | Next.js 16 (App Router, React 19), **TypeScript strict** | Exigé. Les types partagés (`lib/types.ts`) font qu'un changement de protocole casse la compilation des deux côtés au lieu de casser en classe. |
| Environnement d'exécution | Bun 1.4 | Exécute TypeScript directement (pas de compilation du serveur), inclut le pilote PostgreSQL, le hachage de mots de passe et le lanceur de tests. |
| Style (TECH-03) | Tailwind CSS v4 | Exigé. Les couleurs restent des variables CSS, ce qui permet de changer de thème en direct (DES-05). |
| Base de données (TECH-04) | PostgreSQL 17 | Exigée. |
| Accès aux données (TECH-04) | Drizzle ORM sur le pilote `Bun.SQL` | Voir ci-dessous. |
| Temps réel (TECH-06) | Socket.IO 4 | Voir [ADR-001](#adr-001--technologie-temps-réel). |
| Hébergement (TECH-05) | Render (service web) + Neon (PostgreSQL), forfaits gratuits | Justification dans [deploiement.md](deploiement.md). |
| Tests (TECH-09) | `bun test` + GitHub Actions | Intégré à Bun, aucune dépendance de plus. |

### Accès aux données (TECH-04)

Toutes les requêtes passent par Drizzle (`db`, dans `server/db.ts`). Les
valeurs sont envoyées comme paramètres, jamais collées dans la requête, et
le résultat est typé à partir du schéma :

```ts
const [row] = await db
  .select({ id: users.id, passwordHash: users.passwordHash })
  .from(users)
  .where(usernameIs(username));
```

Quand Drizzle n'a pas de fonction pour une expression (`lower()`,
`random()`, `count(*) filter (...)`), on l'écrit avec le gabarit `sql` de
Drizzle, qui paramètre aussi les valeurs.

Le schéma est décrit en TypeScript avec **Drizzle ORM** dans
`server/schema.ts`. Drizzle a été choisi parce qu'il reste proche du SQL déjà
écrit, qu'il fonctionne directement avec le pilote de Bun (`drizzle-orm/bun-sql`)
et qu'il n'ajoute pas de langage de schéma à part, contrairement à Prisma.

- **Migrations versionnées** : `bun run db:generate` compare `schema.ts` à
  l'historique et écrit une nouvelle migration SQL dans `drizzle/`, qui est
  commitée. Au démarrage, `migrate()` (`server/db.ts`) applique celles que la
  base n'a pas encore vues; Drizzle les note dans
  `drizzle.__drizzle_migrations`.
- **Bases d'avant les migrations** : la base locale et celle de production
  avaient déjà toutes les tables. `adoptLegacyDatabase()` les marque comme
  étant déjà à la migration de départ (`0000_baseline.sql`) au lieu de la
  rejouer. Les noms de contraintes et d'index de `schema.ts` sont ceux des
  anciennes tables, et le schéma obtenu a été comparé (`pg_dump`) à celui
  d'une base neuve : ils sont identiques.
- **Seed** : `bun run db:seed` (`scripts/seed.ts`) remplit la banque de
  textes, crée trois comptes de démonstration et leur historique de courses.
  Il peut être relancé sans rien dupliquer. Le mot de passe vient de
  `SEED_PASSWORD`.
- **Exception** : `adoptLegacyDatabase()` écrit directement dans la table
  de suivi de Drizzle avec `Bun.SQL`, puisqu'elle s'exécute avant le
  migrateur. Les tests nettoient aussi leurs données en SQL.

## Modèle de données

```mermaid
erDiagram
    users ||--o{ sessions : "a"
    users ||--o{ identities : "se connecte avec"
    users ||--o{ unlocks : "débloque"
    users ||--o{ races : "a couru"
    users ||--o| avatars : "a pour photo"
    race_runs ||--o{ races : "regroupe"
    users {
        int id PK
        text username "unique sans tenir compte de la casse"
        text display_name
        text password_hash "argon2id; vide si GitHub/Discord seulement"
        bool is_admin
        timestamptz created_at
    }
    sessions {
        text token PK "aléatoire, 32 octets"
        int user_id FK
        timestamptz created_at
        timestamptz expires_at "30 jours"
    }
    identities {
        text provider PK "github ou discord"
        text provider_id PK "l'identifiant chez le fournisseur"
        int user_id FK "un de chaque au plus par compte"
        timestamptz created_at
    }
    unlocks {
        int user_id PK, FK
        text mount PK
    }
    races {
        int id PK
        int user_id FK
        text room_code
        int wpm
        int accuracy
        int score "MPM x précision"
        int time_ms
        int place
        int riders
        timestamptz finished_at
        int_array wpm_samples "MPM seconde par seconde (RES-05)"
        jsonb missed_keys "touche -> fois manquée (RES-03)"
        int run_id FK "la course (HIST-02)"
        text player_id "qui il était dans le peloton"
    }
    avatars {
        int user_id PK, FK
        bytea image "WebP 256 x 256, redimensionnée par le serveur"
        timestamptz updated_at
    }
    race_runs {
        int id PK
        text room_code
        timestamptz finished_at
        bool bonuses
        jsonb players "tout le peloton tel qu'affiché (HIST-02)"
    }
    passages {
        int id PK
        text language "en ou fr"
        text body
        timestamptz created_at
    }
    words {
        text language PK
        text word PK
    }
```

- Un résultat n'est enregistré que pour les **comptes connectés** qui ont
  **fini** la course. Les invités courent normalement, sans historique.
- L'entraînement (`/practice`) n'ouvre aucun socket et n'écrit jamais dans la
  base.
- Comptes, sessions et identités GitHub/Discord sont supprimés en cascade
  avec l'utilisateur.

### Tables prévues pour la remise finale

| Table | Pour | Contenu |
| --- | --- | --- |
| `room_members` | SALLE-06 | Une ligne par personne présente dans une salle, avec une contrainte d'unicité sur la personne : la règle « une seule salle à la fois » est garantie par la base. |
| `bans` | SALLE-07 | Personnes expulsées d'une salle. |
| colonnes de `races` | RES-02 | MPM brut, nombre d'erreurs, statut (terminé, temps écoulé, abandon), bonus reçus, touches manquées. |

## Machine à états d'une course (COURSE-01)

Chaque salle est toujours dans **un seul** de ces états, et seuls les
événements ci-dessous le font changer. C'est le serveur (`server/rooms.ts`)
qui tient l'état : les navigateurs affichent ce qu'il leur envoie
(`roomUpdate`) et ne peuvent pas changer d'état eux-mêmes.

| État dans COURSE-01 | Code (`room.status`) |
| --- | --- |
| EN_ATTENTE | `lobby` |
| DÉCOMPTE | `countdown` |
| EN_COURSE | `racing` |
| RÉSULTATS | `finished` |
| FERMÉE | la salle est retirée de la mémoire |

```mermaid
stateDiagram-v2
    state "EN_ATTENTE" as ATTENTE
    state "DÉCOMPTE" as DECOMPTE
    state "EN_COURSE" as COURSE
    state "RÉSULTATS" as RESULTATS
    state "FERMÉE" as FERMEE
    [*] --> ATTENTE : l'hôte crée la salle
    ATTENTE --> DECOMPTE : l'hôte lance (≥ 2 participants prêts, dont 1 personne)
    DECOMPTE --> COURSE : 3 s plus tard
    COURSE --> RESULTATS : tous les participants ont fini ou abandonné
    COURSE --> RESULTATS : temps maximal atteint (réglé par l'hôte, 3 min par défaut)
    RESULTATS --> ATTENTE : l'hôte relance
    ATTENTE --> FERMEE : la dernière personne part
    RESULTATS --> FERMEE : la dernière personne part
    DECOMPTE --> FERMEE : la dernière personne part
    COURSE --> FERMEE : la dernière personne part
    FERMEE --> [*]
```

### Transitions

| De → vers | Déclencheur | Condition vérifiée par le serveur | Ce qui se passe | Code |
| --- | --- | --- | --- | --- |
| *(rien)* → EN_ATTENTE | Un hôte rejoint un code qui n'existe pas | Rôle demandé = hôte, et code émis par le serveur (`POST /api/rooms`) depuis moins de 5 min (SALLE-02) | Salle créée; la langue du texte part de la langue d'interface de l'hôte | `createRoom` |
| EN_ATTENTE → DÉCOMPTE | L'hôte clique « Lancer la course » (`startRace`) | C'est bien l'hôte; salle en attente; au moins 2 participants prêts, bots compris, dont au moins une personne (COURSE-02). Revérifié après le chargement du texte (un double clic ne lance qu'une course) | Un texte est tiré de la banque selon la configuration; seuls les participants **prêts** deviennent partants; départ fixé à maintenant + 3 s | `startRace`, `startCountdown` |
| DÉCOMPTE → EN_COURSE | Minuterie de 3 s (`COUNTDOWN_MS`) | — | Les positions sont diffusées toutes les 100 ms; la minuterie de 3 min démarre | `startRace` |
| EN_COURSE → RÉSULTATS | Le dernier partant encore en course finit ou abandonne | Chaque partant a fini ou abandonné (déconnecté depuis plus de 30 s); un partant déconnecté depuis moins longtemps peut revenir, donc on l'attend (COURSE-09) | Classement de tout le monde (COURSE-10), résultats enregistrés pour les comptes connectés | `endIfEveryoneFinished`, `dropHeldLane`, `endRace`, `rankField` |
| EN_COURSE → RÉSULTATS | Temps maximal écoulé | `settings.maxTimeMs` depuis le départ (CONF-01 : aucun, ou 30 s à 10 min; 3 min par défaut) | Idem; ceux qui n'ont pas fini sont classés par progression | `startRace`, `endRace` |
| RÉSULTATS → EN_ATTENTE | L'hôte clique « Retour au salon » (`playAgain`) | C'est bien l'hôte; salle en résultats | Les joueurs encore déconnectés sont retirés; tout le monde redevient « pas prêt » | `backToLobby` |
| n'importe quel état → FERMÉE | La dernière personne quitte | Plus personne dans la salle | Minuteries arrêtées, salle effacée de la mémoire | `removePlayer` |

### Ce que chaque état permet

| Action | EN_ATTENTE | DÉCOMPTE | EN_COURSE | RÉSULTATS |
| --- | --- | --- | --- | --- |
| Rejoindre la salle | Oui | Oui, comme spectateur jusqu'à la prochaine course | Oui, comme spectateur | Oui, voit les résultats |
| Se déclarer prêt (`toggleReady`) | Oui | Non | Non | Non |
| Changer la configuration (`updateSettings`, hôte) | Oui, diffusée à tous (CONF-12) | Non | Non | Non |
| Envoyer un participant aux estrades (`setWatching`, hôte) | Oui | Non | Non | Non |
| Envoyer ses touches (`typed`) | Ignorées | Ignorées | Jugées par le serveur; acceptées si plausibles (max ~300 MPM) | Ignorées |
| Lancer (`startRace`) / revenir au salon (`playAgain`) | Lancer | — | — | Revenir au salon |
| Un partant se déconnecte | — | Sa voie est gardée 30 s | Sa voie et sa progression sont gardées 30 s (COURSE-08) | Son résultat est gardé jusqu'au retour au salon |

### Minuteries

| Nom (code) | Durée | Rôle |
| --- | --- | --- |
| `COUNTDOWN_MS` | 3 s | Décompte avant le départ (COURSE-03) |
| `settings.maxTimeMs` | aucun, ou 30 s à 10 min (3 min par défaut) | Temps maximal d'une course, réglé par l'hôte (CONF-01); l'écran affiche le temps restant |
| `RECONNECT_MS` | 30 s | Voie gardée pour un participant déconnecté; passé ce délai, il a abandonné (COURSE-08) |
| `HOST_RECLAIM_MS` | 20 s | Place d'hôte gardée avant de passer à la personne présente depuis le plus longtemps (SALLE-08) |
| `TICK_MS` | 100 ms | Fréquence de diffusion des positions pendant la course (COURSE-05) |

### L'état d'un joueur dans une salle

- **Rôle** : `host` ou `rider`. L'hôte court seulement si `settings.hostRides` est vrai (SALLE-01); il compte alors pour le minimum.
- **`watching`** : participant envoyé aux estrades par l'hôte. Il ne peut pas se déclarer prêt; l'état reste d'une course à l'autre.
- **`ready`** : participant prêt (l'hôte qui court est prêt d'office). Remis à faux au retour au salon.
- **`racing`** : partant de la course en cours, figé au lancement.
- **`finished`**, **`score`** : fixés à l'arrivée. La **`place`** est donnée à tous les partants à la fin de la course (COURSE-10) : d'abord ceux qui ont fini, par temps; puis ceux arrêtés par le temps maximal, par progression; enfin ceux qui ont abandonné, par progression au moment de partir. Le score (MPM × précision) est affiché, mais ne compte plus pour le classement.
- **`away`** : partant déconnecté dont la voie est gardée. Le même onglet (même `clientId`) qui revient reprend sa voie.
- **`abandoned`** : partant parti depuis plus de 30 s pendant la course (COURSE-08). Il reste dans le classement avec la progression qu'il avait; s'il revient, il regarde la fin de la course sans pouvoir taper.

### Écarts connus avec le cahier de l'enseignant

La machine actuelle suit le premier cahier des charges. Ces points changent
pour respecter le travail de session; ils sont suivis dans
[EXIGENCES.md](EXIGENCES.md) :

- **SALLE-09** : on ne pourra plus rejoindre pendant DÉCOMPTE et EN_COURSE
  (aujourd'hui, on y entre comme spectateur).
- **COURSE-11** : l'hôte pourra aussi **fermer** la salle depuis les
  résultats (transition RÉSULTATS → FERMÉE explicite).

## Flux des messages temps réel

### Une course, du lancement aux résultats

```mermaid
sequenceDiagram
    participant H as Navigateur de l'hôte
    participant J as Navigateur d'un participant
    participant S as Serveur (rooms.ts)
    participant DB as PostgreSQL

    J->>S: joinRoom(code, nom, monture, clientId)
    S-->>J: réponse : rôle obtenu ou code d'erreur
    S--)H: roomUpdate (liste des personnes présentes)
    S--)J: roomUpdate
    J->>S: toggleReady
    S--)H: roomUpdate
    H->>S: startRace
    S->>DB: tire un texte (configuration de la salle)
    S--)H: roomUpdate (DÉCOMPTE, texte, heure de départ)
    S--)J: roomUpdate (DÉCOMPTE, texte, heure de départ)
    Note over S: 3 s
    loop pendant la course
        J->>S: typed(base, touches) à chaque mot fini
        Note over S: rejoue les touches sur sa copie du texte,<br/>rejette les progressions impossibles
        S--)H: positions (toutes les 100 ms)
        S--)J: positions (toutes les 100 ms)
    end
    S->>DB: résultats des comptes connectés
    S--)H: roomUpdate (RÉSULTATS, classement)
    S--)J: roomUpdate (RÉSULTATS, classement)
```

### Événements Socket.IO

| Événement | Sens | Contenu |
| --- | --- | --- |
| `joinRoom` | navigateur → serveur | code, nom, monture, rôle voulu, `clientId`, langue d'interface. Réponse : rôle obtenu ou code d'erreur |
| `toggleReady` | navigateur → serveur | — (participant, en attente) |
| `updateSettings` | navigateur → serveur | `{ language?, kind?, hostRides? }` (hôte, en attente) |
| `setWatching` | navigateur → serveur | `(playerId, watching)` : envoie un participant aux estrades ou l'en fait revenir (hôte, en attente) |
| `addBot` | navigateur → serveur | `level` : ajoute un bot de ce niveau (hôte, en attente; CONF-10) |
| `removeBot` | navigateur → serveur | `playerId` : retire ce bot (hôte, en attente) |
| `kickPlayer` | navigateur → serveur | `playerId` : expulse cette personne pour de bon (hôte; SALLE-07) |
| `kicked` | serveur → la personne expulsée | elle n'est plus dans la salle et ne peut plus y revenir |
| `startRace` | navigateur → serveur | — (hôte). Réponse : `ok` ou code d'erreur |
| `typed` | navigateur → serveur | les touches tapées depuis le dernier envoi (`\b` pour un retour arrière) et le nombre de caractères corrects avant elles; c'est le serveur qui les juge |
| `playAgain` | navigateur → serveur | — (hôte, sur les résultats) |
| `leaveRoom` | navigateur → serveur | — |
| `createInvite` | navigateur → serveur | — (hôte). Réponse : le jeton d'un nouveau lien d'invitation (SALLE-04) |
| `watchRooms`, `unwatchRooms` | navigateur → serveur | — : commence ou arrête de recevoir `roomList` (page `/rooms`, JOIN-02) |
| `roomUpdate` | serveur → salle | l'état public complet de la salle |
| `positions` | serveur → salle | toutes les 100 ms pendant la course : `{ id, progress }` par partant |
| `roomList` | serveur → explorateur | les salles publiques (code, hôte, participants, capacité, texte, état), dès qu'une salle change, au plus deux fois par seconde |
| `inviteList` | serveur → hôte seulement | ses liens d'invitation et qui les a utilisés |
| `bonus` | serveur → salle | un bonus de remontée joué : type, qui l'a gagné, qui il touche (BONUS-03) |
| `yourText` | serveur → un joueur | son propre texte, après qu'un bonus l'a raccourci ou allongé (BONUS-04) |

Charge réseau (PERF-02) : un participant envoie au plus un message par mot
fini, pas un par touche; le serveur regroupe toutes les positions dans un
seul message toutes les 100 ms. Rien n'est écrit dans la base pendant la
course : les résultats le sont une fois, à la fin.

### API HTTP

| Route | Rôle |
| --- | --- |
| `POST /api/auth/signup`, `login`, `logout` | Comptes par nom d'utilisateur et mot de passe; la session est un cookie HttpOnly |
| `GET /api/auth/me` | L'utilisateur connecté (ou `null`) et les fournisseurs proposés |
| `POST /api/account/name` | Change le nom de cavalier de l'utilisateur connecté (AUTH-05) |
| `POST`, `DELETE /api/account/avatar` | Envoie (le corps est l'image) ou retire la photo de profil (AUTH-04, SEC-02) |
| `GET /api/avatars/:id` | La photo de profil, en WebP 256 px; l'adresse porte sa version, donc elle se garde en cache |
| `GET /api/auth/github/start`, `…/callback` (idem `discord`) | Connexion OAuth (AUTH-01); connecté, cela lie le compte. Détails dans `server/oauth.ts` |
| `POST /api/rooms` | Un code de salle neuf, de 6 caractères, réservé pour l'hôte (SALLE-02), avec la visibilité de départ demandée (`{ visibility }`, sur code par défaut) |
| `POST /api/rooms/quick` | La salle publique où envoyer un cavalier (« Faire une course », JOIN-03), ou `null` |
| `GET /api/text?lang=en\|fr&kind=sentences\|words` | Un texte pour l'entraînement |
| `GET /api/stats/me` | Résumé des statistiques (connecté) |
| `GET /api/history?page=N` | L'historique, 10 courses par page (connecté; HIST-01) |
| `GET /api/races/:id` | Les résultats complets d'une course passée, pour qui l'a courue (HIST-02) |
| `GET /api/stats/leaderboard` | Meilleurs scores du serveur |
| `GET /api/health` | Vérification de l'hébergeur; ne touche pas la base |
| `POST /api/admin/mount` | Donner ou retirer une monture (admin) |

Le serveur n'envoie jamais de phrases : les erreurs sont des **codes**
(`room-full`, `wrong-credentials`…) que le navigateur traduit (I18N-01).

## ADR-001 : technologie temps réel

**Statut** : accepté (septembre 2026).

### Contexte

La piste doit montrer la progression de tous les participants en direct
(COURSE-05, au moins ~4 mises à jour par seconde), le serveur doit être la
source de vérité (COURSE-06), et une salle compte jusqu'à 30 participants.
Les messages vont dans les deux sens : les touches montent du navigateur, les
positions et l'état de la salle descendent. Tout service externe doit être
gratuit (TECH-08).

Next.js (App Router) ne sait pas garder une connexion WebSocket ouverte dans
ses routes : il faut un serveur à côté, ou un service externe.

### Options considérées

| Option | Pour | Contre |
| --- | --- | --- |
| **Socket.IO** sur le même serveur que Next.js | Salles intégrées (`io.to(code)`), reconnexion automatique, accusés de réception (une action reçoit une réponse), repli sur le *polling* si un réseau bloque les WebSockets, événements typés avec TypeScript | Un serveur personnalisé (`server.ts`) au lieu de `next start`; une dépendance |
| WebSocket brut (`ws` ou `Bun.serve`) | Aucune couche en plus, messages plus légers | Salles, reconnexion, réponses et battements de cœur à réécrire à la main |
| Server-Sent Events + requêtes HTTP | Pas de serveur personnalisé | Un sens seulement : chaque frappe devient une requête HTTP; état partagé entre requêtes à gérer |
| Service hébergé (Pusher, Ably, Supabase Realtime) | Rien à héberger pour le temps réel | Le serveur n'est plus au milieu des messages (difficile d'être autoritaire), limites des forfaits gratuits, un service de plus à configurer pour corriger |
| MQTT | Léger, modèle publication/abonnement | Il faut un courtier (broker) en plus, et un pont WebSocket pour le navigateur |

### Décision

**Socket.IO**, dans le même processus Bun que Next.js (`server.ts`).
L'arbitre (`server/rooms.ts`) garde l'état de chaque salle en mémoire et est
le seul à le modifier.

### Conséquences

- On lance l'application avec `bun run dev` / `bun run start` (le serveur
  personnalisé), jamais `next dev` / `next start`.
- **Une seule instance** : l'état des salles est en mémoire, donc on ne peut
  pas répartir la charge sur plusieurs serveurs sans ajouter Redis
  (adaptateur Socket.IO). C'est suffisant pour une classe. Ça exclut aussi
  les hébergeurs « serverless » comme Vercel, où les instances ne partagent
  rien et les connexions sont coupées après quelques minutes.
- Un redémarrage du serveur interrompt les courses en cours.
- Le protocole est typé une fois (`lib/types.ts`) et vérifié par le
  compilateur des deux côtés, et chaque message reçu est validé par un
  schéma Zod (TECH-07).

## ADR-002 : gestion des bots

**Statut** : accepté et implanté (octobre 2026; BOT-01 à BOT-05, CONF-10).
Code : `lib/bots.ts` (le moteur) et `server/rooms.ts` (`addBot`,
`driveBots`, `advance`).

### Contexte

Des bots de cinq niveaux complètent les salles (CONF-10), comptent pour le
minimum de 2 participants (COURSE-02), subissent les bonus et malus comme les
humains (BOT-04), varient leur vitesse (BOT-02), font des erreurs qu'ils
corrigent selon le mode d'erreur (BOT-03), et doivent être testables à
partir d'une graine (BOT-05).

### Décision

**Les bots tournent sur le serveur, dans l'arbitre, et passent par le même
chemin que les humains.**

1. **Un bot est un participant** de la salle, avec un champ `bot` qui donne
   son niveau (`null` pour une personne). Il n'a pas de socket et est
   toujours prêt. L'hôte l'ajoute ou le retire dans la salle d'attente
   (`addBot`, `removeBot`). Il est étiqueté « BOT » dans la salle, sur la
   piste et dans les résultats (BOT-04), et il compte dans la capacité.
2. **Un moteur pur** (`lib/bots.ts`) calcule, à partir d'une graine, du texte,
   du niveau et du mode d'erreur, la liste des touches que le bot va taper et
   le moment de chacune : `planBot({ seed, text, level, errorMode })` →
   `[{ atMs, key }]`. Aucun `Math.random` : un générateur à graine
   (*mulberry32*), donc le même appel donne toujours le même résultat, ce qui
   se teste unitairement (BOT-05). La graine vient du code de la salle, du
   numéro de la course et de l'identifiant du bot (`seedOf`).
3. **L'arbitre rejoue ce plan** : à chaque tic de 100 ms, `driveBots` prend
   les touches dont l'heure est passée et les fait passer par `replayKeys`
   puis `advance`, exactement comme les touches d'une personne (événement
   `typed`). Progression, précision, MPM, anti-triche et classement sont donc
   calculés de la même façon pour tous.
4. **Personnes d'abord** : une course demande au moins une personne
   (COURSE-02, erreur `need-human`); la place d'hôte ne passe jamais à un
   bot (SALLE-08); une salle où il ne reste que des bots est fermée.
5. **Bonus** (BONUS-04) : si un bonus change le texte d'un bot, son plan est
   recalculé depuis sa position (`replanBot`); dans le brouillard, il perd 2 s.

### Le modèle de frappe

| Niveau | MPM visé | Taux d'erreur |
| --- | --- | --- |
| Noob | 10–20 | ~12 % |
| Débutant | 20–35 | ~8 % |
| Intermédiaire | 35–60 | ~5 % |
| Expert | 70–100 | ~2 % |
| Impossible | 140–170 | ~0,5 % |

- **Vitesse de base** : un MPM tiré dans la plage du niveau au début de la
  course, converti en délai moyen par caractère (60 000 ms ÷ (MPM × 5)).
- **Variation** (BOT-02) : un bruit sur chaque délai, des « rafales » (plusieurs
  caractères plus rapides) et des **hésitations** plus longues avant les mots
  difficiles (longs, avec majuscules, accents, chiffres ou ponctuation).
- **Erreurs** (BOT-03) : selon le taux du niveau, le bot tape une touche
  voisine sur le clavier. En **correction obligatoire**, il s'en rend compte
  après 0 à 2 caractères, attend un court temps de réaction, efface avec des
  retours arrière et retape. En **mode libre**, il continue et l'erreur est
  comptée.
- **Vitesse finale exacte** : chaque erreur et chaque pause coûtent du temps,
  donc le plan brut finit plus lentement que la vitesse tirée. Il est étiré
  à la fin pour finir exactement à cette vitesse, sans changer le rythme
  à l'intérieur (rafales, hésitations, corrections).
- « Impossible » est plafonné à 170 MPM pour rester loin de la limite
  anti-triche du serveur (~300 MPM).

### Conséquences

- Pas de trafic réseau pour les bots, et l'anti-triche du serveur les juge
  comme tout le monde (le niveau « Impossible », à 140+ MPM, reste sous la
  limite de ~300 MPM).
- Les tests (`tests/bots.test.ts`) rejouent chaque plan dans les règles de
  frappe, comme le serveur, sur des passages français et anglais et
  plusieurs graines. Ils vérifient : même graine, même course; le MPM dans la
  plage du niveau; moins d'erreurs aux niveaux supérieurs; des délais qui
  varient; des pauses plus longues avant les mots difficiles; le respect du
  mode d'erreur; et la limite anti-triche. `tests/rooms.test.ts` joue une
  vraie course contre un bot.
- Les résultats des bots ne sont pas enregistrés dans la base.

## Sécurité

- **Mots de passe** hachés avec argon2id (`Bun.password`), jamais stockés ni
  journalisés en clair (SEC-03). Une connexion avec un compte inexistant
  prend le même temps qu'un mauvais mot de passe.
- **Session** : jeton aléatoire dans un cookie `HttpOnly`, `SameSite=Lax`, et
  `Secure` en production.
- **OAuth** : un paramètre `state` aléatoire, gardé dans un cookie, est
  vérifié au retour; les comptes sont liés par l'identifiant du fournisseur,
  jamais par le nom affiché.
- **SQL** toujours paramétré.
- **Téléversements** (SEC-02) : taille comptée par le serveur, type réel lu
  dans les premiers octets puis confirmé en décodant l'image; on ne garde que
  la copie redimensionnée par le serveur (`server/avatars.ts`).
- **Liens d'invitation** (SALLE-04) : jeton de 128 bits tiré par
  `crypto.randomBytes`, lié à l'adresse IP de la première personne qui
  l'utilise. En ligne, l'adresse vient de l'en-tête `CF-Connecting-IP` posé
  par Cloudflare devant Render; partout ailleurs, cet en-tête pourrait être
  forgé, donc on prend l'adresse de la connexion (`clientIp`). Les liens
  vivent en mémoire avec la salle : la fermer les annule tous.
- **Entrées validées par un schéma** (TECH-07, `server/schemas.ts`, Zod) :
  messages Socket.IO, corps JSON et paramètres d'URL. Une entrée qui ne
  respecte pas son schéma est refusée avec un code d'erreur
  (`bad-request`, ou le code précis du champ : `bad-code`, `name-format`…).
  Le rappel d'accusé de réception d'un message est aussi vérifié : un client
  qui en envoie un faux ne peut pas faire planter le serveur.
- **Le serveur décide** : le navigateur envoie les touches tapées, jamais un
  verdict. Le serveur les rejoue avec les mêmes règles (`replayKeys` dans
  `lib/typing.ts`) sur sa propre copie du texte. Une page modifiée pour
  compter chaque touche comme bonne n'avance donc pas. Une progression plus
  rapide qu'un humain est ignorée. Les actions de l'hôte (lancer, configurer,
  envoyer aux estrades) sont vérifiées côté serveur (SEC-01).
- **Limite connue** : un script qui envoie les *bonnes* touches à la place
  du joueur reste possible, comme sur tout jeu de frappe en ligne; seule la
  limite de vitesse (~300 MPM) le borne.

## Langues (I18N-01)

Chaque mot de l'interface est dans `lib/i18n/en.ts` et `lib/i18n/fr.ts`. Le
dictionnaire français est typé avec la forme de l'anglais : une traduction
manquante est une erreur de compilation. La langue de départ est choisie par
le serveur (cookie, sinon langue du navigateur). La langue du **texte à
taper** est un réglage séparé de la salle (CONF-02).

## Tests et intégration continue (TECH-09)

`bun test` lance 121 tests : règles du moteur de frappe, moteur des bots,
score et dictionnaires, arbitre avec de vrais clients Socket.IO, et API HTTP. GitHub
Actions (`.github/workflows/ci.yml`) vérifie le lint, les types
(`tsc --noEmit`), les tests (avec une vraie base PostgreSQL) et le build à
chaque envoi.

## Installation

```bash
bun install
docker compose up -d           # PostgreSQL 17 sur localhost:5434 (compose.yaml)
cp .env.example .env           # pointe déjà vers cette base
bun run dev                    # applique les migrations, puis http://localhost:3000
bun run db:seed                # facultatif : comptes de démonstration et historique
bun test                       # les tests (utilisent aussi la base)
```

## Limites connues

- Hébergement gratuit : le serveur s'endort après 15 minutes sans visite (voir [deploiement.md](deploiement.md)).
- L'état des salles est en mémoire : un redémarrage du serveur interrompt les
  courses en cours (voir [ADR-001](#adr-001--technologie-temps-réel)).
