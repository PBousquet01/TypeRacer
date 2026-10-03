# Matrice de traçabilité des exigences

État de chaque exigence du *Travail de session — Web V*, où elle se trouve
dans le code et comment elle est vérifiée.

*Dernière mise à jour : 2 octobre 2026.* À mettre à jour dans le même commit
que tout changement qui fait avancer une exigence.

**Statut** : ✅ complet · 🟡 partiel · ❌ non fait.
**Tests associés** : les noms entre guillemets sont des tests automatisés de
`tests/` (lancés par `bun test` et à chaque envoi sur GitHub).

## Résumé

| Section | ✅ | 🟡 | ❌ | Total |
| --- | --- | --- | --- | --- |
| Contraintes techniques (TECH) | 9 | 1 | 0 | 10 |
| Identité visuelle et design (DES) | 5 | 1 | 0 | 6 |
| Comptes et profil (AUTH) | 4 | 2 | 0 | 6 |
| Salles et visibilité (SALLE) | 5 | 2 | 3 | 10 |
| Rejoindre une course (JOIN) | 3 | 0 | 0 | 3 |
| Configuration (CONF) | 11 | 1 | 0 | 12 |
| Déroulement d'une course (COURSE) | 7 | 3 | 1 | 11 |
| Bots (BOT) | 5 | 0 | 0 | 5 |
| Bonus de remontée (BONUS) | 4 | 0 | 0 | 4 |
| Résultats (RES) | 5 | 0 | 0 | 5 |
| Historique (HIST) | 2 | 0 | 0 | 2 |
| Internationalisation (I18N) | 2 | 1 | 0 | 3 |
| Tests (TEST) | 1 | 0 | 2 | 3 |
| Performance (PERF) | 1 | 1 | 1 | 3 |
| Accessibilité (A11Y) | 0 | 4 | 0 | 4 |
| Sécurité (SEC) | 3 | 0 | 0 | 3 |
| **Total** | **67** | **16** | **7** | **90** |

## Contraintes techniques (TECH)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| TECH-01 | ✅ | `app/`, `server.ts` | CI : étape « Build » | Next.js 16, App Router, React 19. |
| TECH-02 | ✅ | `tsconfig.json`, `eslint.config.ts`, `postcss.config.json` | CI : étapes « Lint » et « Type-check » | Aucun fichier `.js`, `.jsx`, `.mjs` ou `.cjs` dans le dépôt; `strict: true`; `no-explicit-any` est en erreur (règle incluse par `eslint-config-next/typescript`); aucun `any`, `@ts-ignore` ni `@ts-expect-error`. |
| TECH-03 | ✅ | `app/globals.css`, `components/` | CI : étape « Build » | Tailwind CSS v4. |
| TECH-04 | ✅ | `server/schema.ts`, `drizzle/`, `server/db.ts`, `scripts/seed.ts` | Tests de `api.test.ts` et `rooms.test.ts` sur une vraie base (la CI part d'une base vide et applique les migrations) | PostgreSQL 17 et Drizzle ORM : schéma, requêtes, migrations versionnées appliquées au démarrage, seed (textes, comptes de démonstration, historique). Voir [ARCHITECTURE.md](ARCHITECTURE.md#accès-aux-données-tech-04). |
| TECH-05 | 🟡 | `render.yaml`, `GET /api/health` | En ligne : <https://chocobo-race.onrender.com> (HTTPS, course complète jouée le 2 octobre 2026) | Fonctionnel en production en HTTPS, mais sur Render (plateforme gratuite), pas sur un VPS. Approbation de l'enseignant demandée. Justification dans [deploiement.md](deploiement.md). |
| TECH-06 | ✅ | `server/rooms.ts`, `components/Track.tsx` | Tous les tests de `rooms.test.ts` | Socket.IO. Voir [ADR-001](ARCHITECTURE.md#adr-001--technologie-temps-réel). |
| TECH-07 | ✅ | `server/schemas.ts`, `server/rooms.ts`, `server/api.ts` | « TECH-07: a join of the wrong shape is refused, and a bad acknowledgement can't crash the server », « TECH-07: setWatching with the wrong types is ignored », « invalid settings are ignored », « the server judges the keys: wrong ones don't move the bird », « a body that isn't the expected shape gets the matching error code », « a body that isn't JSON is a bad request », « a text in a language the site doesn't have is refused » | Zod : chaque message Socket.IO qui porte des données (`joinRoom`, `updateSettings`, `setWatching`, `typed`), chaque corps JSON (`signup`, `login`, `admin/mount`) et chaque paramètre d'URL (`/api/text`, retour OAuth). Les messages d'erreur des schémas sont les codes d'erreur de l'API. Le projet n'utilise pas d'actions serveur Next.js. |
| TECH-08 | ✅ | `render.yaml` | — | Render et Neon en forfaits gratuits; GitHub et Discord OAuth gratuits. Rien à payer pour corriger. |
| TECH-09 | ✅ | `.github/workflows/ci.yml` | 121 tests; CI verte | Lint, `tsc --noEmit`, tests (avec PostgreSQL) et build à chaque envoi. |
| TECH-10 | ✅ | `.env.example`, `.gitignore` | — | Toutes les variables lues par le serveur et les scripts y sont documentées. Aucun secret commité. |

## Identité visuelle et design (DES)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| DES-01 | ✅ | [DEMARCHE-CREATIVE.md](DEMARCHE-CREATIVE.md) | — | Noms envisagés et raison du choix. |
| DES-02 | ✅ | `design/logo-original.png`, `public/logo.png`, `app/icon.png` | — | Logo dessiné à la main, utilisé dans l'application et comme favicon. |
| DES-03 | ✅ | [DEMARCHE-CREATIVE.md](DEMARCHE-CREATIVE.md) | — | Moodboard, palette, typographies. |
| DES-04 | ✅ | `app/globals.css`, `components/Track.tsx`, `components/Chocobo.tsx` | — | Style « fenêtres de jeu rétro »; la piste de chocobos est l'élément signature. |
| DES-05 | ✅ | `components/ThemeToggle.tsx`, `app/layout.tsx` | — | Suit le système par défaut; un script lancé avant le premier affichage applique le thème gardé, donc pas de flash. |
| DES-06 | 🟡 | Mises en page adaptatives (point de rupture à 900 px) | — | Les pages s'adaptent au téléphone. **Reste** : remplacer la course par un message recommandant un clavier physique sur mobile, et vérifier chaque page à 360 px. |

## Comptes et profil (AUTH)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| AUTH-01 | ✅ | `server/oauth.ts`, `server/auth.ts`, `server/api.ts`, `app/account/page.tsx` | « the first sign-in makes an account; the next one finds it again », « a callback whose state doesn't match is refused », « a signed-in rider can link Discord, but not someone else's », « signing up signs you in with an HttpOnly cookie », « a wrong password is refused » | GitHub et Discord actifs en local et en ligne; nom d'utilisateur et mot de passe aussi offerts. Un compte peut lier les deux fournisseurs. Les tests simulent les fournisseurs. |
| AUTH-02 | 🟡 | `app/page.tsx`, `lib/profile.ts` | Tous les tests de `rooms.test.ts` jouent en invité | Pseudonyme de 2 à 16 caractères, gardé dans le navigateur. **Reste** : 3 à 20 caractères, session d'invité dans un cookie signé. |
| AUTH-03 | 🟡 | `server/rooms.ts`, `server/stats.ts` | — | Pas d'historique pour les invités. **Reste** : un invité peut encore créer une salle; avatar généré. |
| AUTH-04 | ✅ | `server/avatars.ts`, `POST`/`DELETE /api/account/avatar`, `GET /api/avatars/:id`, table `avatars` (migration `drizzle/0003_avatars.sql`), `components/Avatar.tsx`, `app/account/page.tsx` | « AUTH-04, SEC-02: a profile photo is checked by its bytes and its size, then stored resized » | JPEG, PNG ou WebP, 2 Mo au plus, vérifiés côté serveur. Redimensionnée avant l'affichage : recadrée en carré de 256 px, enregistrée en WebP dans PostgreSQL (le disque de l'hébergeur ne survit pas à un redémarrage). Affichée sur la page du compte et des statistiques; sans photo, un avatar généré avec les initiales. |
| AUTH-05 | ✅ | `POST /api/account/name`, `setDisplayName` dans `server/auth.ts`, formulaire « Nom de cavalier » de `app/account/page.tsx` | « AUTH-05: a signed-in rider changes their display name; the username stays » | Validé comme tout nom de cavalier (2 à 16 caractères : lettres, chiffres, espaces, - et _). Le nom d'utilisateur servant à la connexion ne change pas; les résultats déjà enregistrés gardent le nom de l'époque. |
| AUTH-06 | ✅ | `app/stats/page.tsx`, `components/ProgressChart.tsx`, `GET /api/stats/me` | « stats need an account », « RES-04: beating your best WPM is a personal record; a first or a slower race isn't » | Meilleur MPM, MPM moyen, précision moyenne, nombre de courses et de victoires, et graphique du MPM de ses 100 dernières courses (la plus ancienne à gauche, info-bulle avec la date). |

## Salles et visibilité (SALLE)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| SALLE-01 | 🟡 | `createRoom`, réglage « Toi, l'hôte » (`settings.hostRides`) | « COURSE-5: a host who rides counts towards the minimum and races » | L'hôte choisit de courir ou de regarder. **Reste** : réserver la création aux utilisateurs connectés. |
| SALLE-02 | ✅ | `lib/rules.ts`, `reserveRoomCode` dans `server/rooms.ts`, `POST /api/rooms` | « SALLE-02: room codes are six unambiguous characters », « SALLE-02: a malformed code is refused », « SALLE-02: a host can't open a room on a code the server didn't issue », « SALLE-02: the server hands a host a fresh six-character code » | 6 caractères tirés par le serveur (`crypto.randomInt`) parmi 31, sans 0/O, 1/I/L; jamais un code déjà pris. Un hôte ne peut ouvrir une salle que sur un code émis par le serveur (réservé 5 min). Un code tapé avec des minuscules, des espaces ou des tirets est accepté. |
| SALLE-03 | ✅ | `settings.visibility`, `publicRooms` et `joinRoom` dans `server/rooms.ts`, réglage « Qui peut entrer » de `components/Lobby.tsx` | « SALLE-03: only public rooms are listed, and the list follows changes live », « SALLE-03, SALLE-04: a private room takes an invite link, never the code alone », « SALLE-03: a new room can ask for a visibility, but only a real one » | Publique : dans l'explorateur et « Faire une course ». Sur code (par défaut) : code ou lien. Privée : lien seulement. L'hôte change la visibilité dans la salle d'attente. |
| SALLE-04 | ✅ | `createInvite`, `sendInvites`, `clientIp` dans `server/rooms.ts`, panneau « Liens d'invitation » de `components/Lobby.tsx` | « SALLE-03, SALLE-04: a private room takes an invite link, never the code alone », « SALLE-04: links die with the room », « SALLE-04, SALLE-07: a kicked rider's invite link is revoked » | L'hôte crée autant de liens qu'il veut, les copie et voit leur statut (non utilisé, ou utilisé par qui). Jeton de 128 bits (`randomBytes(16)`). Le premier usage lie le lien à l'adresse IP; une autre IP est refusée, la même peut revenir. Les liens vivent en mémoire avec la salle et disparaissent à sa fermeture. IP : en ligne, l'en-tête `CF-Connecting-IP` de Cloudflare (Render est derrière Cloudflare); ailleurs, l'adresse de la connexion. Le lien d'un participant expulsé est révoqué (SALLE-07). |
| SALLE-05 | 🟡 | `lib/rules.ts` (`MIN_RIDERS`, `MAX_RIDERS`) | « COURSE-3: a race needs two ready riders », « COURSE-4: a room takes 40 riders, not one more » | Minimum 2, maximum fixe de 40; les spectateurs ne comptent pas. **Reste** : capacité réglable par l'hôte, de 2 à 30. |
| SALLE-06 | ❌ | `leaveCurrentRoom` | — | Un même onglet quitte sa salle avant d'en rejoindre une autre, mais rien n'est garanti par la base et deux onglets créent deux joueurs. |
| SALLE-07 | ✅ | `kickPlayer` dans `server/rooms.ts`, bouton « Expulser » de `components/Lobby.tsx` | « SALLE-07: the host kicks a rider out for good; nobody else can », « SALLE-04, SALLE-07: a kicked rider's invite link is revoked » | L'hôte expulse un cavalier ou un spectateur, après confirmation; la personne est retirée tout de suite (même en course) et prévenue. Elle ne peut plus revenir : refusée par son onglet (`clientId`) et, si elle est connectée, par son compte. Pas par adresse IP : toute une classe partage souvent la même. Limite : un invité qui ouvre un nouvel onglet a un nouvel identifiant; une session d'invité par cookie signé (AUTH-02) fermera cette porte. |
| SALLE-08 | ✅ | `server/rooms.ts` (`HOST_RECLAIM_MS`) | « COURSE-14: a riding host who drops keeps their lane and the host seat » | La place d'hôte est gardée 20 s pour une reconnexion, puis passe à la personne présente depuis le plus longtemps. Salle fermée quand il n'y a plus personne. |
| SALLE-09 | ❌ | `joinRoom` (`lateArrival`) | « COURSE-7: someone arriving mid-race watches » | Aujourd'hui, on peut entrer pendant une course comme spectateur. À interdire. |
| SALLE-10 | ❌ | — | — | Limite de tentatives par IP. |

## Rejoindre une course (JOIN)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| JOIN-01 | ✅ | `components/JoinCard.tsx`, `app/page.tsx` | « riders need a room that exists » | Champ de code sur la page d'accueil; bouton « Copier l'invitation ». |
| JOIN-02 | ✅ | `app/rooms/page.tsx`, `publicRooms` et `announceRoomList` dans `server/rooms.ts` | « SALLE-03: only public rooms are listed, and the list follows changes live » | Page `/rooms` : code, hôte, participants et capacité, langue, type et complexité du texte, état. Mise à jour en direct par Socket.IO (au plus deux fois par seconde), sans recharger. Filtres : langue, type de texte et complexité. |
| JOIN-03 | ✅ | `quickRaceRoom` dans `server/rooms.ts`, `POST /api/rooms/quick`, bouton de `app/page.tsx` | « JOIN-03: quick play picks the fullest public room with a free place, the oldest on a tie », « JOIN-03: quick play answers with a room code, or null when no public room is free » | Parmi les salles publiques en attente ou sur les résultats et pas pleines : la plus remplie, puis la plus ancienne. Si aucune : un utilisateur connecté peut ouvrir une salle publique (configuration par défaut) dont il devient l'hôte; un invité voit un message. |

## Configuration de la course (CONF)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| CONF-01 | ✅ | `settings.maxTimeMs`, `startRace` dans `server/rooms.ts`, réglage « Temps maximal » de `components/Lobby.tsx` | « CONF-01, CONF-04 to CONF-07: the host's text settings shape the race text » | Aucun, 30 s, 1, 2, 3 (par défaut), 5 ou 10 min; le serveur refuse toute valeur hors de 30 s à 10 min. Sans limite, la course finit quand tous ont fini (et le dernier appel de 30 s reste en place, voir COURSE-09). |
| CONF-02 | ✅ | `room.settings.language`, `components/Lobby.tsx` | « TXT-3: texts come from the bank, in the language asked for » | Indépendante de la langue de l'interface. |
| CONF-03 | ✅ | `server/texts.ts`, tables `passages` et `words` | « TXT-3: texts come from the bank, in the language asked for » | 12 passages FR + 12 EN; dictionnaires de 280 et 330 mots. |
| CONF-04 | ✅ | `lib/textgen.ts` (`buildText`), réglage « Longueur » | « CONF-04: the text has the length the host asked for, in words », « CONF-01, CONF-04 to CONF-07: the host's text settings shape the race text » | 10, 25 (par défaut), 50 ou 100 mots (5 à 200 acceptés par le serveur). Passages : enchaînés puis coupés au nombre de mots; mots au hasard : tirés ce nombre de fois. |
| CONF-05 | ✅ | `lib/textgen.ts` (`buildText`) (`passageLevel`, `wordFits`), réglage « Difficulté » | « CONF-05: complexity is measured: word length, accents, apostrophes » | Critères mesurables. Passages : longueur moyenne des mots (en lettres) : facile sous 4,3, moyen de 4,3 à 4,6, difficile à partir de 4,6 (seuils choisis pour répartir la banque en trois). Mots au hasard : facile = 3 ou 4 lettres sans accent ni apostrophe; moyen = 6 lettres au plus; difficile = 5 lettres et plus. |
| CONF-06 | ✅ | `lib/textgen.ts` (`buildText`), boutons « Dans le texte » | « CONF-06: punctuation, capitals and accents can be taken out of any text », « CONF-06: random words get numbers, capitals and punctuation when asked » | Désactivés, la ponctuation, les majuscules et les accents sont retirés de tout texte (les apostrophes dans les mots restent). Activés, les mots au hasard reçoivent des majuscules, des virgules et points, et des nombres. Choix documenté : les nombres ne s'ajoutent qu'aux mots au hasard, car les passages sont de vrais textes (option désactivée pour eux). |
| CONF-07 | ✅ | `lib/textgen.ts` (`buildText`), champs « Pratiquer ces lettres » / « Exclure ces lettres » | « CONF-07: excluded characters never appear; included ones are in every word » | Mots au hasard seulement (désactivé pour les passages, comme le permet l'exigence). Exclure : aucun mot contenant ces lettres, accents compris (exclure « e » exclut « é »). Inclure : seulement des mots qui contiennent l'une d'elles; s'il en reste moins de 5, ce filtre est abandonné plutôt que de faire échouer la course. |
| CONF-08 | ✅ | `ErrorMode`, `progressChars`, `correctCount` dans `lib/typing.ts`; `settings.errorMode`; réglage « Fautes » de `components/Lobby.tsx` | « CONF-08: in free mode a rider carries on past mistakes and finishes at the text's length », « CONF-08: in free mode a rider finishes with mistakes left in, and they count », « BOT-03: in correct mode a bot fixes every slip; in free mode it never backspaces », « can't type more than 5 characters past a mistake » | Correction obligatoire (par défaut) : impossible d'aller plus de 5 caractères au-delà d'une faute. Libre : on continue, la faute reste et compte dans la précision, le nombre d'erreurs et le MPM net (seuls les caractères justes comptent, annexe A); on finit en ayant tapé autant de caractères que le texte. Les mêmes règles servent au navigateur, au serveur et aux bots. |
| CONF-09 | ✅ | `settings.bonuses`, réglage « Bonus de remontée » de `components/Lobby.tsx` | « CONF-09: with bonuses off, nobody gets one » | Désactivés par défaut; l'hôte les active dans la salle d'attente. |
| CONF-10 | ✅ | `addBot`, `removeBot` dans `server/rooms.ts`, panneau « Bots » de `components/Lobby.tsx` | « CONF-10: the host adds and removes bots; riders can't, and a made-up level is ignored » | L'hôte ajoute un bot du niveau choisi ou le retire, dans la salle d'attente. Les bots comptent dans la capacité. |
| CONF-11 | 🟡 | réglage « Qui peut entrer » de `components/Lobby.tsx` | « SALLE-03: only public rooms are listed, and the list follows changes live » | La visibilité se règle dans la salle d'attente. **Reste** : la capacité (SALLE-05). |
| CONF-12 | ✅ | `updateSettings`, `components/Lobby.tsx` | « COURSE-11: the host's settings reach riders; riders can't change them », « invalid settings are ignored » | Diffusée à toute la salle en direct. |

## Déroulement d'une course (COURSE)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| COURSE-01 | ✅ | `server/rooms.ts` | Tous les tests de `rooms.test.ts` | Documentée dans [ARCHITECTURE.md](ARCHITECTURE.md#machine-à-états-dune-course-course-01). FERMÉE : la salle est retirée quand la dernière personne part. |
| COURSE-02 | ✅ | `lib/rules.ts`, `starters()` et `startRace` dans `server/rooms.ts` | « COURSE-3: a race needs two ready riders », « COURSE-5: a host who rides counts towards the minimum and races », « COURSE-02: bots count towards the minimum, but a race needs a person » | 2 participants au minimum, bots compris; au moins une personne (`need-human`); les spectateurs ne comptent pas. |
| COURSE-03 | ✅ | `startRace`, `startCountdown` | « the race starts after a countdown », « a double click on Start starts one race » | Texte tiré et envoyé au début du décompte de 3 s; heure de départ fixée par le serveur. |
| COURSE-04 | ✅ | `components/TypingBox.tsx`, `hooks/useTypingEngine.ts` | « pasting text past the end is ignored » | Caractère correct, incorrect, curseur; MPM et précision en direct; coller bloqué. |
| COURSE-05 | ✅ | `components/Track.tsx` | Démonstration avec 12 participants | Monture, nom, position et MPM courant; positions toutes les 100 ms avec transition fluide; joueur local mis en évidence; les spectateurs voient la piste. |
| COURSE-06 | ✅ | `server/rooms.ts`, `replayKeys` dans `lib/typing.ts` | « the server judges the keys: wrong ones don't move the bird », « progress faster than a human is ignored (anti-cheat) », « a finished rider's result can't be changed » | Départ, fin, progression et classement décidés par le serveur. Les bonus (pas encore faits) passeront aussi par lui. |
| COURSE-07 | 🟡 | Bouton « Quitter », `holdLane` | — | Quitter la course compte comme abandon après 30 s. **Reste** : bouton « Abandonner » avec confirmation. |
| COURSE-08 | ✅ | `holdLane`, `reclaimLane`, `components/RaceScreen.tsx` | « COURSE-14: a dropped rider keeps their lane and progress » | 30 s (`RECONNECT_MS`), puis abandon. |
| COURSE-09 | 🟡 | `endIfEveryoneFinished`, `startFinishClock` | « COURSE-15: the first finish starts the last call » | Fin quand tous ont fini ou au temps maximal. **Écart** : un dernier appel de 30 s après le premier arrivé, à retirer. |
| COURSE-10 | ❌ | `rankFinishers` | « TXT-9: the careful rider wins on score, even crossing second » | Classement actuel au score (MPM × précision), choix du premier cahier des charges. À remplacer par : arrivée, puis progression, puis abandons. |
| COURSE-11 | 🟡 | `playAgain`, `backToLobby` | « back to the lobby keeps everyone » | Relancer avec les mêmes personnes et changer la configuration. **Reste** : fermer la salle. |

## Bots (BOT)

Approche : [ADR-002](ARCHITECTURE.md#adr-002--gestion-des-bots).

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| BOT-01 | ✅ | `lib/bots.ts` (`BOT_LEVELS`) | « BOT-01: every level finishes the text at a speed in its range », « BOT-01, BOT-03: slower levels make more mistakes », « BOT-01, BOT-04: a bot races through the same referee, finishes in its speed range and gets a place » | Valeurs retenues : Noob 10–20 MPM, ~12 % d'erreurs; Débutant 20–35, ~8 %; Intermédiaire 35–60, ~5 %; Expert 70–100, ~2 %; Impossible 140–170, ~0,5 % (plafonné à 170 pour rester loin de la limite anti-triche de ~300 MPM). Le MPM final est tiré dans la plage au début de chaque course. |
| BOT-02 | ✅ | `planBot` dans `lib/bots.ts` | « BOT-02: the speed varies; no metronome », « BOT-02: bots hesitate before hard words » | Bruit sur chaque touche, rythme qui dérive d'un mot à l'autre (rafales et ralentissements), pauses avant les mots difficiles (`wordDifficulty` : longueur, majuscules, chiffres, ponctuation, accents). |
| BOT-03 | ✅ | `planBot` dans `lib/bots.ts` | « BOT-03: in correct mode a bot fixes every slip; in free mode it never backspaces », « BOT-01, BOT-03: slower levels make more mistakes » | Une erreur tombe sur une touche voisine (QWERTY). En correction obligatoire, le bot continue 0 à 2 caractères, s'arrête, efface et retape : le temps perdu le ralentit. Le mode libre est prêt dans le moteur; il servira quand CONF-08 sera fait. |
| BOT-04 | ✅ | `BotTag` dans `components/ui.tsx`, `replanBot` dans `server/rooms.ts` | « BOT-01, BOT-04: a bot races through the same referee, finishes in its speed range and gets a place », « BOT-04: a bot leader hit by a bonus still finishes its own, changed text » | Étiquette « BOT » partout. Les bots reçoivent bonus et malus : texte changé → plan recalculé depuis leur position; brouillard → ils perdent 2 s. |
| BOT-05 | ✅ | `lib/bots.ts` (`seededRandom`, `seedOf`, `planBot`) | « BOT-05: the same seed plays the same race; another seed plays a different one », et tous les tests de `tests/bots.test.ts` | Fonction pure, sans `Math.random` ni horloge. La graine vient du code de la salle, du numéro de la course et du bot. |

## Bonus de remontée (BONUS)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| BONUS-01 | ✅ | `lib/bonuses.ts` (`laggards`, `checkpointsPassed`), `playCheckpoints` dans `server/rooms.ts` | « BONUS-01: checkpoints at 25, 50 and 75 % of the leader's text », « BONUS-01: lagging means last, or more than 25 % behind the leader », « BONUS-01: no more than 3 bonuses each, and nothing for riders who finished », « BONUS-01 to BONUS-04: the rider left behind gets a bonus at the leader's first checkpoint » | Règle exacte en tête de `lib/bonuses.ts` : points de contrôle quand le meneur passe 25, 50 et 75 % de son texte; en retard = encore en course, pas le meneur, et dernier ou à plus de 25 % derrière; un bonus par point de contrôle, donc 3 au plus. |
| BONUS-02 | ✅ | `lib/bonuses.ts` (`awardCheckpoint`, `shorten`, `lengthen`) | « BONUS-02: the leader is slowed at most once per checkpoint; the others shorten their own text », « BONUS-02: all three kinds come up, and the same seed gives the same bonuses », « BONUS-02: a text too short to lose words gives the leader +3 words instead » | Trois types tirés au hasard (graine) : −3 mots (texte du joueur en retard), +3 mots (texte du meneur), brouillard (prochains mots du meneur flous 4 s). Le meneur n'est touché qu'une fois par point de contrôle. |
| BONUS-03 | ✅ | événement `bonus`, `hooks/useRecentBonuses.ts`, `Track.tsx`, `RaceScreen.tsx`, `SpectatorScreen.tsx` | « BONUS-01 to BONUS-04: the rider left behind gets a bonus at the leader's first checkpoint » | Étiquette sur la piste à côté du cavalier touché, message au-dessus de la zone de frappe pour le joueur concerné, flou sur la zone de frappe pendant le brouillard. |
| BONUS-04 | ✅ | `text` de chaque joueur dans `server/rooms.ts`, événement `yourText` | « BONUS-01 to BONUS-04: the rider left behind gets a bonus at the leader's first checkpoint », « BONUS-04: words change only at the end, after where the rider is » | Chaque joueur a sa copie du texte; les mots ne changent qu'à la fin, après sa position. Progression = caractères validés ÷ longueur de son texte; MPM calculé sur son texte (annexe A). |

## Résultats et statistiques (RES)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| RES-01 | ✅ | `components/Results.tsx` | — | |
| RES-02 | ✅ | `components/Results.tsx`, `endRace` dans `server/rooms.ts`, `raceStatus` et `rawWpmOf` dans `lib/rules.ts` | « TXT-9: the careful rider wins on score, even crossing second », « RES-02: how a race ended, and raw WPM » | Rang, participant, score, MPM, MPM brut (toutes les touches tapées, annexe A), précision, nombre d'erreurs, temps, statut (terminé, temps écoulé ou abandon) et bonus reçus. Statut : « abandon » pour qui avait quitté la course quand elle s'est terminée, « temps écoulé » pour qui était encore là sans avoir fini. Le tableau défile horizontalement sur un petit écran. |
| RES-03 | ✅ | `components/WpmChart.tsx`, `components/KeyHeatmap.tsx`, `sampleWpm` et `countMiss` dans `server/rooms.ts` | « RES-03: replaying keys reports which characters were missed », « BOT-01, BOT-04: a bot races through the same referee, finishes in its speed range and gets a place » | Deux graphiques sous le tableau des résultats. 1) MPM net de chaque participant seconde par seconde, sur un même graphique (8 courbes au plus : toi et les mieux classés; légende, noms en bout de courbe, info-bulle au survol). 2) Clavier en carte de chaleur des touches manquées, pour toi par défaut ou pour le cavalier choisi; les caractères hors clavier (accents, guillemets…) sont listés dessous. Couleurs vérifiées (daltonisme, contraste) sur les deux thèmes. |
| RES-04 | ✅ | `recordRace` dans `server/stats.ts`, `RecordTag` dans `components/ui.tsx`, `components/Results.tsx` | « RES-04: beating your best WPM is a personal record; a first or a slower race isn't » | Pour un cavalier connecté qui finit : MPM plus élevé que son meilleur MPM des courses précédentes. Une première course n'a rien à battre. Étiquette « RECORD » sur le podium et dans le tableau, message dans « Ta course »; gardé aussi pour l'historique. |
| RES-05 | ✅ | `recordRace` dans `server/stats.ts`, colonnes `wpm_samples` et `missed_keys` (migration `drizzle/0001_race_charts.sql`) | Tests de `api.test.ts` et `rooms.test.ts` sur une vraie base | Les résultats de chaque participant connecté sont enregistrés à la fin de la course, avec la série du MPM et les touches manquées, pour réafficher les graphiques (HIST-02). |

## Historique (HIST)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| HIST-01 | ✅ | `GET /api/history`, tableau « Tes courses » de `app/stats/page.tsx` | « stats need an account », « HIST-01, HIST-02: the history comes a page at a time, and a race's full results only to its riders » | Chaque course terminée par l'utilisateur connecté, la plus récente d'abord, 10 par page (précédente / suivante). Les dates sont affichées dans la langue choisie. |
| HIST-02 | ✅ | `GET /api/races/:id`, `app/history/[id]/page.tsx`, table `race_runs` (migration `drizzle/0002_race_history.sql`) | « HIST-01, HIST-02: the history comes a page at a time, and a race's full results only to its riders » | Un clic sur « Résultats » réaffiche la page de résultats complète : podium, tableau de tous les participants (invités et bots compris), graphique du MPM et carte de chaleur, avec la date. Seuls les cavaliers de cette course y ont accès. Les courses enregistrées avant cette fonction n'ont pas de résultats complets et ne sont pas cliquables. |

## Internationalisation (I18N)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| I18N-01 | ✅ | `lib/i18n/en.ts`, `lib/i18n/fr.ts`, `generateMetadata` dans `app/layout.tsx` | « every server code has a French and an English message », « French places » | Une traduction manquante est une erreur de compilation; les erreurs du serveur sont des codes traduits par le navigateur. |
| I18N-02 | ✅ | `components/LanguageToggle.tsx`, `lib/i18n/server.ts` | — | Sur toutes les pages; gardé dans un cookie; langue du navigateur par défaut. |
| I18N-03 | 🟡 | `formatDateTime` dans `lib/format.ts` | — | Les dates de l'historique sont formatées selon la langue (`Intl.DateTimeFormat`). **Reste** : les autres dates et les nombres. |

## Tests (TEST)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| TEST-01 | ✅ | `tests/` | 121 tests | Moteur de frappe, moteur des bots, règles, arbitre avec de vrais clients Socket.IO, API. |
| TEST-02 | ❌ | — | — | Playwright. |
| TEST-03 | ❌ | — | — | La connexion par nom d'utilisateur et mot de passe existe déjà; les tests Playwright l'utiliseront. |

## Performance (PERF)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| PERF-01 | ❌ | — | — | Lighthouse pas encore mesuré. |
| PERF-02 | ✅ | `shouldReport` dans `lib/typing.ts`, `TICK_MS` | — | Un message par mot fini, pas par touche; positions regroupées toutes les 100 ms; résultats écrits une seule fois, à la fin. |
| PERF-03 | 🟡 | `components/Track.tsx` | Démonstration avec 12 participants | Barres compactes au-delà de 10 participants. **Reste** : mesurer à 30. |

## Accessibilité (A11Y)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| A11Y-01 | 🟡 | `app/globals.css` | — | Pas encore audité (contraste WCAG AA, deux thèmes). |
| A11Y-02 | 🟡 | `components/ui.tsx` | — | `<table>` pour les résultats et les statistiques. **Reste** : audit des balises (`header`, `nav`, `main`, `footer`, ordre des titres). |
| A11Y-03 | 🟡 | `components/` | — | Pas encore audité. |
| A11Y-04 | 🟡 | `app/globals.css` | — | Pas encore audité (navigation au clavier, focus visible). |

## Sécurité (SEC)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| SEC-01 | ✅ | `server/rooms.ts` | « only the host can start », « COURSE-11: the host's settings reach riders; riders can't change them », « COURSE-6: the host sends a rider to the stands, where they can't ready up » | Lancer, configurer et envoyer aux estrades sont vérifiés côté serveur. Les actions à venir (liens, expulsion, fermeture) le seront aussi. |
| SEC-02 | ✅ | `sniffImage` et `prepareAvatar` dans `server/avatars.ts`, `readBytes` dans `server/api.ts` | « AUTH-04, SEC-02: a profile photo is checked by its bytes and its size, then stored resized » | Taille comptée par le serveur pendant la lecture (413 au-delà de 2 Mo, sans couper la connexion). Type réel lu dans les premiers octets du fichier (signature JPEG, PNG ou WebP), pas dans son nom ni son en-tête, puis confirmé en décodant l'image (sharp); limite de pixels contre les fichiers « bombe ». Le serveur ne garde jamais le fichier reçu, seulement sa propre copie redimensionnée. |
| SEC-03 | ✅ | `server/auth.ts` | « signing up signs you in with an HttpOnly cookie », « a wrong password is refused » | argon2id (`Bun.password`); jamais stocké ni journalisé en clair. |

## Choix et ambiguïtés (section 2.2)

- **Premier cahier des charges.** Le projet a commencé avec son propre cahier
  des charges (classement au score, 40 participants, spectateurs en retard).
  Là où il contredit le travail de session, c'est le travail de session qui
  l'emporte; les écarts restants sont marqués « Reste » ou « Écart » dans
  la matrice.
- **SALLE-08, délai de l'hôte.** La place d'hôte est gardée 20 s avant de
  passer à quelqu'un d'autre, pour qu'un simple rechargement de page ne la
  fasse pas perdre.
- **Montures.** Les avatars sur la piste sont des montures (chocobos et
  autres). Certaines sont réservées à des comptes; la vérification se fait
  côté serveur.
