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
| Contraintes techniques (TECH) | 7 | 2 | 1 | 10 |
| Identité visuelle et design (DES) | 5 | 1 | 0 | 6 |
| Comptes et profil (AUTH) | 1 | 3 | 2 | 6 |
| Salles et visibilité (SALLE) | 1 | 4 | 5 | 10 |
| Rejoindre une course (JOIN) | 1 | 0 | 2 | 3 |
| Configuration (CONF) | 3 | 1 | 8 | 12 |
| Déroulement d'une course (COURSE) | 6 | 4 | 1 | 11 |
| Bots (BOT) | 0 | 0 | 5 | 5 |
| Bonus de remontée (BONUS) | 0 | 0 | 4 | 4 |
| Résultats (RES) | 1 | 2 | 2 | 5 |
| Historique (HIST) | 0 | 1 | 1 | 2 |
| Internationalisation (I18N) | 2 | 0 | 1 | 3 |
| Tests (TEST) | 1 | 0 | 2 | 3 |
| Performance (PERF) | 1 | 1 | 1 | 3 |
| Accessibilité (A11Y) | 0 | 4 | 0 | 4 |
| Sécurité (SEC) | 2 | 0 | 1 | 3 |
| **Total** | **31** | **23** | **36** | **90** |

## Contraintes techniques (TECH)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| TECH-01 | ✅ | `app/`, `server.ts` | CI : étape « Build » | Next.js 16, App Router, React 19. |
| TECH-02 | 🟡 | `tsconfig.json`, `eslint.config.mjs` | CI : étapes « Lint » et « Type-check » | `strict: true`; `no-explicit-any` est en erreur (règle incluse par `eslint-config-next/typescript`); aucun `any`, `@ts-ignore` ni `@ts-expect-error`. **Reste** : `eslint.config.mjs` et `postcss.config.mjs` à convertir en TypeScript. |
| TECH-03 | ✅ | `app/globals.css`, `components/` | CI : étape « Build » | Tailwind CSS v4. |
| TECH-04 | ✅ | `server/schema.ts`, `drizzle/`, `server/db.ts`, `scripts/seed.ts` | Tests de `api.test.ts` et `rooms.test.ts` sur une vraie base (la CI part d'une base vide et applique les migrations) | PostgreSQL 17 et Drizzle ORM : schéma, requêtes, migrations versionnées appliquées au démarrage, seed (textes, comptes de démonstration, historique). Voir [ARCHITECTURE.md](ARCHITECTURE.md#accès-aux-données-tech-04). |
| TECH-05 | 🟡 | `render.yaml`, `GET /api/health` | En ligne : <https://chocobo-race.onrender.com> (HTTPS, course complète jouée le 2 octobre 2026) | Fonctionnel en production en HTTPS, mais sur Render (plateforme gratuite), pas sur un VPS. Approbation de l'enseignant demandée. Justification dans [deploiement.md](deploiement.md). |
| TECH-06 | ✅ | `server/rooms.ts`, `components/Track.tsx` | Tous les tests de `rooms.test.ts` | Socket.IO. Voir [ADR-001](ARCHITECTURE.md#adr-001--technologie-temps-réel). |
| TECH-07 | ❌ | `server/rooms.ts`, `server/api.ts` | « invalid settings are ignored » | Les entrées sont vérifiées à la main (noms, codes, réglages, montures), pas par un schéma. Zod à ajouter sur l'API et les messages Socket.IO. |
| TECH-08 | ✅ | `render.yaml` | — | Render et Neon en forfaits gratuits; GitHub et Discord OAuth gratuits. Rien à payer pour corriger. |
| TECH-09 | ✅ | `.github/workflows/ci.yml` | 68 tests; CI verte | Lint, `tsc --noEmit`, tests (avec PostgreSQL) et build à chaque envoi. |
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
| AUTH-04 | ❌ | — | — | Photo de profil (JPEG, PNG, WebP, 2 Mo, redimensionnée). |
| AUTH-05 | ❌ | — | — | Pseudonyme d'affichage modifiable. |
| AUTH-06 | 🟡 | `app/stats/page.tsx`, `GET /api/stats/me` | « stats need an account » | Meilleur MPM, MPM moyen, précision moyenne, nombre de courses et de victoires. **Reste** : graphique de progression du MPM. |

## Salles et visibilité (SALLE)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| SALLE-01 | 🟡 | `createRoom`, réglage « Toi, l'hôte » (`settings.hostRides`) | « COURSE-5: a host who rides counts towards the minimum and races » | L'hôte choisit de courir ou de regarder. **Reste** : réserver la création aux utilisateurs connectés. |
| SALLE-02 | 🟡 | `app/page.tsx` (`makeRoomCode`) | « riders need a room that exists » | Alphabet sans 0/O, 1/I/L. **Reste** : 6 caractères au lieu de 5, générés par le serveur. |
| SALLE-03 | 🟡 | `server/rooms.ts` | — | Toutes les salles sont « sur code ». **Reste** : publique et privée. |
| SALLE-04 | ❌ | — | — | Liens d'invitation à usage unique, liés à une adresse IP. |
| SALLE-05 | 🟡 | `lib/rules.ts` (`MIN_RIDERS`, `MAX_RIDERS`) | « COURSE-3: a race needs two ready riders », « COURSE-4: a room takes 40 riders, not one more » | Minimum 2, maximum fixe de 40; les spectateurs ne comptent pas. **Reste** : capacité réglable par l'hôte, de 2 à 30. |
| SALLE-06 | ❌ | `leaveCurrentRoom` | — | Un même onglet quitte sa salle avant d'en rejoindre une autre, mais rien n'est garanti par la base et deux onglets créent deux joueurs. |
| SALLE-07 | ❌ | — | — | L'hôte peut envoyer un participant aux estrades, pas l'expulser. |
| SALLE-08 | ✅ | `server/rooms.ts` (`HOST_RECLAIM_MS`) | « COURSE-14: a riding host who drops keeps their lane and the host seat » | La place d'hôte est gardée 20 s pour une reconnexion, puis passe à la personne présente depuis le plus longtemps. Salle fermée quand il n'y a plus personne. |
| SALLE-09 | ❌ | `joinRoom` (`lateArrival`) | « COURSE-7: someone arriving mid-race watches » | Aujourd'hui, on peut entrer pendant une course comme spectateur. À interdire. |
| SALLE-10 | ❌ | — | — | Limite de tentatives par IP. |

## Rejoindre une course (JOIN)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| JOIN-01 | ✅ | `components/JoinCard.tsx`, `app/page.tsx` | « riders need a room that exists » | Champ de code sur la page d'accueil; bouton « Copier l'invitation ». |
| JOIN-02 | ❌ | — | — | Explorateur des salles publiques, avec filtres. |
| JOIN-03 | ❌ | — | — | Bouton « Faire une course ». |

## Configuration de la course (CONF)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| CONF-01 | ❌ | `MAX_RACE_MS` | — | Temps maximal fixe de 3 min, pas réglable. |
| CONF-02 | ✅ | `room.settings.language`, `components/Lobby.tsx` | « TXT-3: texts come from the bank, in the language asked for » | Indépendante de la langue de l'interface. |
| CONF-03 | ✅ | `server/texts.ts`, tables `passages` et `words` | « TXT-3: texts come from the bank, in the language asked for » | 12 passages FR + 12 EN; dictionnaires de 280 et 330 mots. |
| CONF-04 | ❌ | — | — | Longueur en nombre de mots. |
| CONF-05 | ❌ | — | — | Complexité facile, moyen, difficile, avec critères mesurables. |
| CONF-06 | ❌ | — | — | Ponctuation, nombres, majuscules, accents. |
| CONF-07 | ❌ | — | — | Caractères à inclure ou exclure. |
| CONF-08 | 🟡 | `lib/typing.ts` (`MAX_CHARS_PAST_MISTAKE`) | « can't type more than 5 characters past a mistake », « fixed mistakes still count against accuracy » | Correction obligatoire seulement. **Reste** : mode libre. |
| CONF-09 | ❌ | — | — | Dépend des bonus (BONUS). |
| CONF-10 | ❌ | — | — | Dépend des bots (BOT). |
| CONF-11 | ❌ | — | — | Dépend de SALLE-03 et SALLE-05. |
| CONF-12 | ✅ | `updateSettings`, `components/Lobby.tsx` | « COURSE-11: the host's settings reach riders; riders can't change them », « invalid settings are ignored » | Diffusée à toute la salle en direct. |

## Déroulement d'une course (COURSE)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| COURSE-01 | ✅ | `server/rooms.ts` | Tous les tests de `rooms.test.ts` | Documentée dans [ARCHITECTURE.md](ARCHITECTURE.md#machine-à-états-dune-course-course-01). FERMÉE : la salle est retirée quand la dernière personne part. |
| COURSE-02 | 🟡 | `lib/rules.ts`, `starters()` | « COURSE-3: a race needs two ready riders », « COURSE-5: a host who rides counts towards the minimum and races » | 2 participants prêts au minimum; les spectateurs ne comptent pas. **Reste** : les bots, et la règle « au moins 1 humain ». |
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

Approche prévue : [ADR-002](ARCHITECTURE.md#adr-002--gestion-des-bots).

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| BOT-01 | ❌ | — | — | Cinq niveaux. |
| BOT-02 | ❌ | — | — | Vitesse variable. |
| BOT-03 | ❌ | — | — | Erreurs et correction, selon le mode d'erreur. |
| BOT-04 | ❌ | — | — | Identifiés dans l'interface; soumis aux bonus. |
| BOT-05 | ❌ | — | — | Moteur déterministe à graine. |

## Bonus de remontée (BONUS)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| BONUS-01 | ❌ | — | — | |
| BONUS-02 | ❌ | — | — | |
| BONUS-03 | ❌ | — | — | |
| BONUS-04 | ❌ | — | — | |

## Résultats et statistiques (RES)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| RES-01 | ✅ | `components/Results.tsx` | — | |
| RES-02 | 🟡 | `components/Results.tsx` | — | Rang, participant, score, MPM, précision, temps. **Reste** : MPM brut, nombre d'erreurs, statut, bonus reçus. |
| RES-03 | ❌ | — | — | Graphique du MPM dans le temps, clavier en carte de chaleur. |
| RES-04 | ❌ | — | — | Indicateur de record personnel. |
| RES-05 | 🟡 | `server/stats.ts`, table `races` | — | Résultats des participants connectés enregistrés. **Reste** : la série temporelle du MPM. |

## Historique (HIST)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| HIST-01 | 🟡 | `app/stats/page.tsx` | « stats need an account » | Les 10 dernières courses. **Reste** : pagination. |
| HIST-02 | ❌ | — | — | Réafficher la page de résultats d'une course passée. |

## Internationalisation (I18N)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| I18N-01 | ✅ | `lib/i18n/en.ts`, `lib/i18n/fr.ts`, `generateMetadata` dans `app/layout.tsx` | « every server code has a French and an English message », « French places » | Une traduction manquante est une erreur de compilation; les erreurs du serveur sont des codes traduits par le navigateur. |
| I18N-02 | ✅ | `components/LanguageToggle.tsx`, `lib/i18n/server.ts` | — | Sur toutes les pages; gardé dans un cookie; langue du navigateur par défaut. |
| I18N-03 | ❌ | — | — | Dates et nombres à formater selon la langue (`Intl`). |

## Tests (TEST)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
| --- | --- | --- | --- | --- |
| TEST-01 | ✅ | `tests/` | 68 tests | Moteur de frappe, règles, arbitre avec de vrais clients Socket.IO, API. |
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
| SEC-02 | ❌ | — | — | Aucun téléversement pour l'instant (voir AUTH-04). |
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
