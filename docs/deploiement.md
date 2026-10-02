# Déploiement (TECH-6)

Le site est hébergé gratuitement, en HTTPS, sur deux services infonuagiques :

| Quoi | Où | Forfait |
| --- | --- | --- |
| Le serveur (pages, API, courses en temps réel) | [Render](https://render.com) | Web Service gratuit |
| La base de données PostgreSQL | [Neon](https://neon.com) | Gratuit, permanent |

## Pourquoi ce choix

Chocobo Race a besoin d'un serveur **qui reste allumé** : chaque joueur garde
une connexion WebSocket ouverte pendant toute la course, et l'arbitre
(`server/rooms.ts`) garde les salons et les minuteries en mémoire.

| Option | Verdict | Raison |
| --- | --- | --- |
| **Render (retenu)** | ✅ | Une seule instance qui reste allumée : les salons en mémoire fonctionnent tels quels. WebSockets pris en charge, HTTPS automatique, Bun pris en charge, gratuit sans carte de crédit. Aucun changement à l'architecture. |
| Vercel | ❌ pour ce projet | Les WebSockets y sont offerts (en bêta), mais deux joueurs d'un même salon peuvent arriver sur deux instances différentes, et les connexions sont coupées après 5 minutes au forfait gratuit. Il faudrait déplacer l'état des salons dans Redis et réécrire les minuteries. |
| Serveur personnel d'un camarade | Non retenu | Fonctionnerait, mais le cahier des charges demande « le serveur du cégep ou un service infonuagique », et des comptes d'élèves seraient gardés sur une machine personnelle. |
| Base de données de Render | ❌ | La base gratuite est supprimée 30 jours après sa création. |
| **Neon (retenu)** | ✅ | PostgreSQL gratuit et permanent, 0,5 Go (la base du projet fait quelques mégaoctets). |

### Limites connues du forfait gratuit

- **Le serveur s'endort après 15 minutes sans visite** et met environ une
  minute à se réveiller. Avant une démonstration, ouvrir le site une ou deux
  minutes à l'avance.
- **Render peut redémarrer le service à tout moment.** C'est rare, mais une
  course en cours serait perdue (les salons sont en mémoire). Les comptes et
  les résultats, eux, sont dans la base et ne sont pas touchés.
- **La base s'endort après 5 minutes d'inactivité** et se réveille en quelques
  secondes; `server/db.ts` ferme les connexions inactives et attend jusqu'à
  30 s une base qui se réveille.

## Ce qui est dans le dépôt

- `render.yaml` : la description du service (commande de build, commande de
  démarrage, région, vérification de santé). Render le lit tout seul.
- `GET /api/health` : l'adresse que Render interroge pour savoir si le serveur
  répond. Elle ne touche pas la base, pour ne pas la garder éveillée.
- Le cookie de session porte `Secure` en production (HTTPS seulement).
- Le site n'est redéployé que si les vérifications GitHub (lint, types, tests,
  build) passent (`autoDeployTrigger: checksPass`).

**Aucun secret n'est dans le dépôt.** L'adresse de la base (`DATABASE_URL`)
est saisie dans le tableau de bord de Render.

## Mise en ligne, étape par étape

### 1. Créer la base de données (Neon)

1. Aller sur <https://neon.com> et se connecter avec GitHub.
2. Créer un projet : nom `chocobo-race`, PostgreSQL 17, région **AWS US East
   (Ohio)** (la même que le serveur).
3. Dans **Connect**, désactiver « Connection pooling », puis copier la chaîne
   de connexion. Elle ressemble à
   `postgresql://utilisateur:motdepasse@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`.
   **C'est un secret** : ne pas la coller dans le code ni dans une conversation.

Les tables et la banque de textes sont créées automatiquement au premier
démarrage du serveur (`migrate()`).

### 2. Créer le serveur (Render)

1. Aller sur <https://render.com> et se connecter avec GitHub.
2. **New → Blueprint**, puis choisir le dépôt `TypeRacer`.
3. Render lit `render.yaml` et demande la valeur de `DATABASE_URL` : y coller
   la chaîne de connexion de Neon.
4. **Apply**. Le premier build prend quelques minutes.
5. L'adresse du site apparaît en haut de la page du service
   (`https://chocobo-race.onrender.com` ou proche).

### 3. Vérifier

- `https://<adresse>/api/health` répond `{"ok":true}`.
- La page d'accueil s'affiche, et le cadenas HTTPS est présent.
- Créer un compte, ouvrir un salon dans un onglet et le rejoindre dans un
  autre : la course doit démarrer et les oiseaux avancer.

### 4. Créer le premier administrateur

Depuis son ordinateur, avec la chaîne de connexion de Neon :

```bash
DATABASE_URL="<chaîne Neon>" bun scripts/admin.ts make-admin <nom d'utilisateur>
```

## Mettre à jour le site

Un `git push` sur `main` suffit : GitHub lance les vérifications, et si elles
passent, Render reconstruit et redémarre le site.
