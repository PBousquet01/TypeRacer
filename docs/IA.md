# Utilisation de l'IA

Comment j'ai travaillé avec des agents IA sur Chocobo Race : les outils, les
fichiers d'instructions, trois erreurs de l'IA et comment je les ai
corrigées, et ce que j'en retiens.

## 1. Agents et outils utilisés

| Outil | Pour quoi |
| --- | --- |
| **Claude Code** (application de bureau, modèles Claude) | L'essentiel du code : serveur de jeu, pages, tests unitaires et de bout en bout, migrations, documentation de `docs/`. Il lance aussi les tests, le serveur et un navigateur pour vérifier ses changements. |
| **Claude Design** | La maquette de départ du thème « fenêtre de menu rétro » qui a servi de base à la charte de design. |

Je n'ai utilisé aucun autre outil d'IA : tout le travail avec l'IA s'est
fait avec Claude.

Ce qui ne vient pas de l'IA : le **nom** du site et le **logo** (DES-01,
DES-02), et les décisions sur ce qui est présenté à l'enseignant.

## 2. Fichiers d'instructions d'agent

- **[`CLAUDE.md`](../CLAUDE.md)**, à la racine du dépôt : les instructions
  que Claude Code lit au début de chaque session. On y trouve :
  - les commandes du projet;
  - les règles à ne jamais briser : TypeScript strict, serveur
    autoritaire, validation Zod de chaque entrée, migrations seulement par
    Drizzle, aucun secret commité, textes de l'interface en français et en
    anglais, nom et logo jamais faits par l'IA;
  - les conventions (commentaires seulement dans le code critique,
    `data-testid` pour les tests de bout en bout);
  - la façon de travailler : une exigence à la fois, la matrice
    `EXIGENCES.md` mise à jour dans le même commit, ne jamais déclarer
    « complet » ce qui ne l'est pas, commiter seulement quand je le demande.
- **[`PROJECT-SUMMARY.md`](../PROJECT-SUMMARY.md)** : la mémoire du projet
  pour l'agent (architecture, règles du jeu, pièges déjà rencontrés). Il
  évite qu'une nouvelle session réexplore tout le code, et il est mis à jour
  à chaque changement important.

## 3. Trois situations où l'IA s'est trompée

### 3.1 Le serveur croyait le navigateur

**L'erreur.** Dans la première version, le navigateur calculait lui-même
combien de caractères étaient corrects et envoyait ce nombre au serveur, qui
le croyait. Le classement reposait donc sur ce que le client affirmait.

**La détection.** Un ami a modifié la fonction `applyInput` dans la page
pour que chaque touche compte comme bonne, et le serveur l'a cru : sa
monture avançait sans qu'il tape le bon texte.

**La correction.** Le serveur est devenu l'arbitre (COURSE-06). Le
navigateur n'envoie plus que les touches tapées; le serveur les rejoue avec
les mêmes règles (`replayKeys` dans `lib/typing.ts`) contre sa propre copie
du texte, et c'est lui qui calcule la position, la précision, le MPM et
l'ordre d'arrivée. Une progression plus rapide qu'environ 300 MPM est
ignorée. Des tests vérifient qu'une page trafiquée ne fait pas avancer la
monture.

### 3.2 Une affirmation sur l'hébergement faite de mémoire

**L'erreur.** Pour l'hébergement (TECH-05), l'IA a écarté Vercel en
affirmant que la plateforme ne supportait pas les WebSockets, sans vérifier.

**La détection.** J'ai trouvé la documentation de Vercel : les WebSockets y
sont maintenant offerts (en bêta).

**La correction.** On a repris la comparaison à partir des documentations
officielles. Vercel restait mal adapté au jeu, pour d'autres raisons : les
salles vivent en mémoire et les instances de Vercel ne la partagent pas, et
les connexions sont coupées après 5 minutes sur le forfait gratuit. Le choix
s'est porté sur Render (un seul serveur toujours actif) avec Neon pour
PostgreSQL. La leçon est restée dans les instructions de l'agent : vérifier
la documentation d'un fournisseur avant d'affirmer ses limites.

### 3.3 Un comportement que je voulais garder, modifié quand même

**L'erreur.** SALLE-09 interdit d'entrer dans une salle pendant une course.
Dans le site, quelqu'un qui arrive en retard entre comme spectateur, et je
voulais garder ce comportement pour en parler à l'enseignant. En reprenant
les exigences non faites, l'agent a compris ma demande autrement et a
commencé à bloquer les retardataires.

**La détection.** Je suivais ce que l'agent faisait pendant qu'il
travaillait, et je l'ai arrêté.

**La correction.** Le changement a été annulé avant d'être commité :
les retardataires regardent toujours la course et courent la suivante.
SALLE-09 est marquée « partiel » dans `EXIGENCES.md` avec la raison, et la
règle a été notée pour l'agent : ne pas modifier un comportement à
« confirmer avec l'enseignant » sans que je le demande. L'enseignant a
ensuite accepté ce choix.

## 4. Réflexion

Dans ce projet, je me voyais surtout comme un répartiteur de tâches. Je
confiais le travail à l'IA une tâche à la fois, pour qu'elle avance de façon
itérative, et je multipliais les commits afin de pouvoir revenir en arrière
au moindre problème.

Ma confiance envers l'IA est restée limitée. Mon expérience en assurance
qualité m'a servi à valider chaque nouveauté au fur et à mesure qu'elle
s'ajoutait. Au bout du compte, tout a toujours été revérifié : par moi, mais
aussi par des amis qui ont généreusement donné de leur temps pour m'aider à
tester.

Dans l'ensemble, le projet s'est bien déroulé, et je l'attribue à mon
expérience avec l'IA et à mes connaissances en QA. Les problèmes étaient
corrigés rapidement, et le développement a naturellement pris la forme du
TDD, une façon de travailler qui aide beaucoup l'IA.

« C'est l'IA qui l'a écrit » n'est effectivement pas une excuse. Je n'ai pas
lu tout le code ligne par ligne, mais j'ai exigé de l'IA qu'elle me rende
compte de chacun de ses changements; je comprends donc le fonctionnement de
l'application dans ses grandes lignes.

Si c'était à refaire, je m'investirais davantage pour comprendre le code de
long en large. Il faut aussi dire que le projet a commencé avant la remise
de l'énoncé, comme un essai qui ne devait pas devenir le projet final.
