# Matrice des exigences (TECH-8)

État de chaque exigence du cahier des charges (*Cahier des charges — Course de
frappe*), où elle se trouve dans le code et comment elle est vérifiée.

*Dernière mise à jour : 2 octobre 2026.* À mettre à jour dans le même
commit que tout changement qui fait avancer une exigence.

**Légende** : ✅ fait · 🟡 partiel · ❌ pas commencé · ⏳ en attente d'une
décision ou d'une ressource externe.
**Vérification** : les noms entre guillemets dans cette colonne sont des tests
automatisés de `tests/` (lancés par `bun test` et à chaque envoi sur GitHub).

## Résumé

| Priorité | ✅ | 🟡 | ❌ | ⏳ | Total |
| --- | --- | --- | --- | --- | --- |
| Essentiel | 29 | 10 | 1 | 0 | 40 |
| Souhaitable | 4 | 6 | 13 | 0 | 23 |
| Moins prioritaire | 0 | 0 | 5 | 0 | 5 |
| Non classée (AUTH-5) | 1 | 0 | 0 | 0 | 1 |
| **Total** | **34** | **16** | **19** | **0** | **69** |

## Authentification et comptes (AUTH)

| ID | Exigence | Priorité | État | Où | Vérification | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| AUTH-1 | Connexion avec GitHub | Essentiel | 🟡 | `server/oauth.ts`, `server/api.ts`, `app/account/page.tsx` | « the first sign-in makes an account; the next one finds it again », « a callback whose state doesn't match is refused » | Code et tests faits (GitHub simulé). À activer : clés dans `.env` et sur Render ([deploiement.md](deploiement.md)). |
| AUTH-2 | Connexion avec Discord | Essentiel | 🟡 | `server/oauth.ts` | « a signed-in rider can link Discord, but not someone else's » | Même état que AUTH-1. |
| AUTH-3 | Un compte peut lier GitHub et Discord | Souhaitable | 🟡 | Table `identities`, page « Ton compte » | « a signed-in rider can link Discord, but not someone else's » | Fait; actif avec les clés, comme AUTH-1. |
| AUTH-4 | Nom d'utilisateur + mot de passe, moins mis en avant | Souhaitable | 🟡 | `server/auth.ts`, `app/account/page.tsx` | « signing up signs you in with an HttpOnly cookie », « a wrong password is refused » | Les boutons GitHub et Discord passent avant le formulaire dès que leurs clés sont configurées. |
| AUTH-5 | Aucune récupération de mot de passe | Non classée | ✅ | — | — | Aucune fonction de récupération n'existe. |
| AUTH-6 | Jouer en invité avec un pseudo | Essentiel | ✅ | `app/page.tsx`, `lib/profile.ts` | Tous les tests de `rooms.test.ts` jouent en invité | Aucun compte requis pour courir. |
| AUTH-7 | Page de paramètres (langue, thème, pseudo, comptes liés) | Souhaitable | 🟡 | `components/LanguageToggle.tsx`, `components/ThemeToggle.tsx` | — | Langue et thème dans la barre du haut; la page « Ton compte » montre et lie les comptes GitHub/Discord; pseudo non modifiable. |

## Salons et courses (COURSE)

| ID | Exigence | Priorité | État | Où | Vérification | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| COURSE-1 | Créer un salon et en devenir l'hôte | Essentiel | ✅ | `server/rooms.ts` (`createRoom`), `app/page.tsx` | Tous les tests de salon créent un salon en hôte | Pas de rôle enseignant distinct (H-13). |
| COURSE-2 | Rejoindre avec un code (ou un lien) | Essentiel | ✅ | `joinRoom`, `components/JoinCard.tsx`, bouton « Copier l'invitation » | « riders need a room that exists » | Le lien privé à usage unique relève de VIS-3. |
| COURSE-3 | Au moins 2 joueurs pour démarrer | Essentiel | ✅ | `lib/rules.ts` (`MIN_RIDERS`), `server/rooms.ts` | « COURSE-3: a race needs two ready riders » | Vérifié côté serveur et bouton désactivé dans le salon. |
| COURSE-4 | Au moins 35 personnes par salon | Essentiel | ✅ | `lib/rules.ts` (`MAX_RIDERS` = 40) | « COURSE-4: a room takes 40 riders, not one more » | 40 selon H-2. Piste compacte au-delà de 10 cavaliers. |
| COURSE-5 | L'hôte choisit de jouer ou de regarder | Essentiel | ✅ | `settings.hostRides`, `starters()` dans `server/rooms.ts`, réglage « Toi, l'hôte » | « COURSE-5: a host who rides counts towards the minimum and races », « COURSE-14: a riding host who drops keeps their lane and the host seat » | L'hôte qui court compte pour le minimum (H-12) et garde la commande de la course. |
| COURSE-6 | L'hôte peut mettre un participant en spectateur | Essentiel | ✅ | `setWatching`, boutons « Aux estrades » / « Laisser courir » dans `components/Lobby.tsx` | « COURSE-6: the host sends a rider to the stands, where they can't ready up » | Dans le salon seulement; l'état reste d'une course à l'autre. |
| COURSE-7 | Un retardataire devient spectateur jusqu'à la course suivante | Essentiel | ✅ | `joinRoom` (`lateArrival`), `components/SpectatorScreen.tsx` | « COURSE-7: someone arriving mid-race watches » | Automatique, sans décision de l'hôte (C-11). |
| COURSE-8 | L'hôte démarre; compte à rebours avant chaque départ | Essentiel | ✅ | `startRace`, `startCountdown` (3 s) | « only the host can start », « the race starts after a countdown », « a double click on Start starts one race » | |
| COURSE-9 | Course de 1 à 3 min; l'hôte règle la durée max | Essentiel | 🟡 | `MAX_RACE_MS` (3 min) | — | Durée maximale fixe; pas encore réglable par l'hôte. |
| COURSE-10 | Le gagnant est le premier à finir le texte | Essentiel | 🟡 | `rankFinishers` | « TXT-9: the careful rider wins on score, even crossing second » | **Écart voulu** : le classement se fait au score (TXT-9). Voir « Écarts ». |
| COURSE-11 | Les réglages de l'hôte s'affichent en direct chez tous | Essentiel | ✅ | `updateSettings`, `components/Lobby.tsx` | « COURSE-11: the host's settings reach riders; riders can't change them », « invalid settings are ignored » | Langue, type de texte et « l'hôte court ». |
| COURSE-12 | Revanche avec les mêmes joueurs, ou fermer le salon | Essentiel | 🟡 | `playAgain`, `backToLobby` | « back to the lobby keeps everyone » | Revanche : oui. Pas de bouton « fermer le salon »; il se ferme quand tout le monde part. |
| COURSE-13 | Un joueur peut abandonner | Essentiel | 🟡 | Bouton « Quitter », `holdLane` | — | Quitter garde la voie 30 s puis compte comme abandon; pas de bouton « abandonner » distinct (F-10). |
| COURSE-14 | Un joueur déconnecté revient avec sa progression | Essentiel | ✅ | `holdLane`, `reclaimLane`, reprise dans `components/RaceScreen.tsx` | « COURSE-14: a dropped rider keeps their lane and progress » | Voie gardée 30 s (`RECONNECT_MS`), même onglet. |
| COURSE-15 | Minuteur de fin après le premier arrivé | Essentiel | ✅ | `startFinishClock`, `components/FinishClock.tsx` | « COURSE-15: the first finish starts the last call » | 30 s (H-3). |
| COURSE-16 | Bouton « Partie rapide » | Souhaitable | ❌ | — | — | |
| COURSE-17 | Copier-coller bloqué dans la zone de frappe | Essentiel | ✅ | `components/TypingBox.tsx` (`onPaste`), `lib/typing.ts` | « pasting text past the end is ignored », « the limit also holds when several characters arrive at once », « progress faster than a human is ignored (anti-cheat) », « the server judges the keys: wrong ones don't move the bird » | Collage bloqué dans la page; le serveur juge lui-même chaque touche et ignore toute progression trop rapide. |

## Visibilité des salons (VIS)

| ID | Exigence | Priorité | État | Où | Vérification | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| VIS-1 | Salons publics listés sur le site | Essentiel | ❌ | — | — | |
| VIS-2 | Salons non listés, accessibles avec le code | Essentiel | ✅ | `server/rooms.ts` | « riders need a room that exists » | Tous les salons sont actuellement non listés. |
| VIS-3 | Salons privés par lien d'invitation | Souhaitable | ❌ | — | — | H-8 : un lien secret par salon plutôt qu'à usage unique. |

## Affichage pendant la course (AFF)

| ID | Exigence | Priorité | État | Où | Vérification | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| AFF-1 | Progression de tous en direct | Essentiel | ✅ | `positions` toutes les 100 ms, `components/Track.tsx` | Démonstration avec 12 cavaliers | Barres compactes au-delà de 10 (H-6); le zoom « top 5 + voisins » n'est pas fait. |
| AFF-2 | Classement en position relative ou vue simple | Souhaitable | ❌ | — | — | |
| AFF-3 | Podium des 3 premiers | Essentiel | ✅ | `components/Results.tsx` | — | |
| AFF-4 | Sons et animations | Souhaitable | 🟡 | Animations dans `app/globals.css` | — | Animations (course, trébuchement, compte à rebours); pas de sons. |

## Texte et règles de frappe (TXT)

| ID | Exigence | Priorité | État | Où | Vérification | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| TXT-1 | Phrases, mots au hasard ou code | Essentiel | 🟡 | `server/texts.ts`, réglage « Type de texte » | « TXT-3: texts come from the bank, in the language asked for » | Phrases et mots au hasard; le code demande une banque d'extraits et un langage (F-12). |
| TXT-2 | L'hôte écrit ou importe son texte | Souhaitable | ❌ | — | — | Demande une modération (H-17). |
| TXT-3 | Textes en base de données ou générés | Essentiel | ✅ | Tables `passages` et `words`, `server/texts.ts`, `server/seed/` | « TXT-3: texts come from the bank, in the language asked for », « the race starts after a countdown » | 12 passages FR + 12 EN, dictionnaires de 280 et 330 mots. Gestion : `bun scripts/admin.ts texts`. |
| TXT-4 | L'hôte règle la longueur | Souhaitable | ❌ | — | — | |
| TXT-5 | Exclure des caractères | Souhaitable | ❌ | — | — | |
| TXT-6 | Accents, ponctuation, majuscules au choix | Souhaitable | ❌ | — | — | |
| TXT-7 | Langue du texte distincte de la langue du site | Souhaitable | ✅ | `room.settings.language`, `components/Lobby.tsx` | « COURSE-11: the host's settings reach riders; riders can't change them » | Un nouveau salon part dans la langue d'interface de l'hôte. |
| TXT-8 | Fautes : continuer ou corriger, au choix de l'hôte | Essentiel | 🟡 | `lib/typing.ts` (`MAX_CHARS_PAST_MISTAKE`) | « can't type more than 5 characters past a mistake », « fixed mistakes still count against accuracy » | Correction obligatoire seulement (défaut de H-10); l'option « laisser la faute » reste à faire. |
| TXT-9 | Le classement pénalise les joueurs rapides mais imprécis | Essentiel | ✅ | `lib/rules.ts` (`scoreOf`), `rankFinishers` | « TXT-9: the careful rider wins on score, even crossing second », « a careful typist can beat a faster, sloppy one », « a finished rider's result can't be changed » | Score = MPM × précision (H-11), précision comptée par le serveur. Le seuil minimal de précision n'est pas encore décidé. |

## Bots (BOT)

| ID | Exigence | Priorité | État | Où | Vérification | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| BOT-1 | Salon avec seulement des bots | Souhaitable | ❌ | — | — | Dépend aussi de COURSE-3 (H-12 : les bots comptent). |
| BOT-2 | Bots et humains mélangés | Souhaitable | ❌ | — | — | |
| BOT-3 | Vitesse réglable, rythme et fautes humains | Souhaitable | ❌ | — | — | |
| BOT-4 | Bot Sensei quasi imbattable | Moins prioritaire | ❌ | — | — | |

## Bonus et jeu (JEU)

| ID | Exigence | Priorité | État | Où | Vérification | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| JEU-1 | Au moins 3 bonus pour les joueurs en retard | Souhaitable | ❌ | — | — | |
| JEU-2 | Le dernier garde une vraie chance de gagner | Souhaitable | ❌ | — | — | Dépend de JEU-1. |
| JEU-3 | Mode mort subite | Moins prioritaire | ❌ | — | — | |
| JEU-4 | Mode équipes | Moins prioritaire | ❌ | — | — | |
| JEU-5 | Objectif de vitesse personnel | Moins prioritaire | ❌ | — | — | |
| JEU-6 | Partie rapide par niveau | Moins prioritaire | ❌ | — | — | Dépend de COURSE-16. |

## Statistiques et progression (STAT)

| ID | Exigence | Priorité | État | Où | Vérification | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| STAT-1 | Stats de fin de course : individuelles et du groupe | Essentiel | 🟡 | `components/Results.tsx` | — | Score, MPM, précision, place et temps de chacun; pas encore de stats de groupe (moyennes). |
| STAT-2 | Page de statistiques avec historique | Souhaitable | ✅ | `app/stats/page.tsx`, `GET /api/stats/me` | « stats need an account » | 10 dernières courses, meilleurs score et MPM, moyennes, victoires. |
| STAT-3 | Invités : stats pendant leur session seulement | Souhaitable | 🟡 | `components/Results.tsx` | — | Écran de résultats seulement; rien n'est gardé d'une course à l'autre. |
| STAT-4 | Système de progression | Souhaitable | 🟡 | Montures débloquables (`unlocks`) | — | Montures données par un admin; pas de progression automatique. |
| STAT-5 | Heatmap du clavier | Souhaitable | ❌ | — | — | Voir aussi F-8 (disposition du clavier). |

## Interface (UX)

| ID | Exigence | Priorité | État | Où | Vérification | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| UX-1 | Design professionnel, amusant et distinctif | Souhaitable | ✅ | `app/globals.css`, `components/` | Évalué en continu | Style « fenêtres de jeu rétro », sprites de chocobos. |
| UX-2 | Nom et logo créés par un humain | Souhaitable | ✅ | `design/logo-original.png`, `public/logo.png` | — | Logo dessiné par l'auteur du projet; original conservé tel quel. |
| UX-3 | Mode clair et mode sombre | Essentiel | ✅ | `components/ThemeToggle.tsx`, `app/globals.css` | — | Suit le système à la première visite, puis le choix est gardé. |
| UX-4 | Site responsive | Essentiel | 🟡 | Mises en page adaptatives (point de rupture à 900 px) | — | Les écrans s'adaptent au téléphone; la frappe au clavier tactile n'est pas traitée (C-13, H-14). |
| UX-5 | Toute l'interface en français et en anglais | Essentiel | ✅ | `lib/i18n/`, `components/LanguageToggle.tsx` | « every server code has a French and an English message », « French places » | Une traduction manquante est une erreur de compilation. |

## Technique (TECH)

| ID | Exigence | Priorité | État | Où | Vérification | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| TECH-1 | Next.js en TypeScript | Essentiel | ✅ | Tout le projet (`tsconfig.json`, mode strict) | CI : étape « Type-check » | Aucun fichier JavaScript dans le code de l'application. |
| TECH-2 | Tailwind CSS | Essentiel | ✅ | `app/globals.css`, classes dans `components/` | CI : étape « Build » | Tailwind v4. |
| TECH-3 | PostgreSQL; outil d'accès choisi et justifié | Essentiel | ✅ | `server/db.ts` | Tests de `api.test.ts` et `rooms.test.ts` sur une vraie base | Justification dans [architecture.md](architecture.md#pourquoi-bunsql-plutôt-quun-orm-tech-3). |
| TECH-4 | Temps réel (WebSocket ou équivalent) | Essentiel | ✅ | Socket.IO, `server/rooms.ts` | Tous les tests de `rooms.test.ts` | |
| TECH-5 | Machine à états documentée | Essentiel | ✅ | `server/rooms.ts` | [machine-a-etats.md](machine-a-etats.md) | |
| TECH-6 | Hébergement HTTPS; choix justifié | Essentiel | ✅ | `render.yaml`, `GET /api/health` | En ligne : <https://chocobo-race.onrender.com> (HTTPS valide, HTTP redirigé, course complète jouée par WebSocket le 2 octobre 2026) | Render + Neon, gratuits. Justification dans [deploiement.md](deploiement.md). |
| TECH-7 | Tests automatisés et intégration continue | Essentiel | ✅ | `tests/`, `.github/workflows/ci.yml` | 68 tests; CI verte sur GitHub | |
| TECH-8 | Documentation technique et matrice tenue à jour | Essentiel | ✅ | `docs/` | Ce document | |
| TECH-9 | Checkpoint #1 : en ligne en HTTPS, auth de base, début du design | Essentiel | ✅ | <https://chocobo-race.onrender.com> | Voir TECH-6 | Site en ligne en HTTPS, comptes par nom d'utilisateur et mot de passe, design en place. |

## Écarts avec le cahier des charges

- **COURSE-10 → score (TXT-9).** Le gagnant n'est plus le premier à franchir
  la ligne mais le meilleur score (MPM × précision) parmi ceux qui ont fini.
  C'est la façon de respecter TXT-9 et de régler C-12. COURSE-10 est à
  réécrire en conséquence.
- **H-11, seuil de précision.** La formule du score est appliquée; le seuil
  minimal (80 % dans H-11) n'est pas implanté tant qu'il n'est pas décidé.

## Suivi des hypothèses

| Hypothèse | État |
| --- | --- |
| H-2 : 40 joueurs par salon | ✅ Appliquée (`MAX_RIDERS`) |
| H-3 : fin quand tous ont fini, à la durée max, ou 30 s après le premier | ✅ Appliquée |
| H-6 : barres compactes au-delà de 10 joueurs, zoom top 5 | 🟡 Barres compactes oui, zoom non |
| H-7 : l'invité reste valide tant que le salon est ouvert | ✅ Appliquée (revanches comprises) |
| H-8 : lien secret par salon | ❌ Pas fait (VIS-3) |
| H-9 : bots après 10 s en partie rapide | ❌ Pas fait (bots et partie rapide) |
| H-10 : correction obligatoire par défaut | ✅ Appliquée; l'option contraire reste à faire (TXT-8) |
| H-11 : score = MPM × précision, seuil 80 % | 🟡 Score oui, seuil à décider |
| H-12 : les bots comptent pour le minimum, pas l'hôte spectateur | 🟡 L'hôte compte seulement s'il court; pas encore de bots |
| H-13 : pas de rôle spécial pour l'enseignant | ✅ Appliquée |
| H-15 : banque de textes FR/EN + mots au hasard | ✅ Appliquée |
| H-17 : filtre de mots interdits et expulsion | ❌ Pas fait |
| H-18 : hébergement Fly.io ou VPS | ✅ Remplacé par Render + Neon (gratuits), en ligne |
