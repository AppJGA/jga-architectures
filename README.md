# JGA Espace Collaborateur

Application web PWA pour Jacques Gerbe & Associés Architectures.  
Stack : React 18 + Vite · Supabase · Tailwind CSS · vite-plugin-pwa

---

## Prérequis

- Node.js 18+
- Un projet Supabase (gratuit sur supabase.com)

---

## Installation locale

```bash
# 1. Cloner
git clone <url-du-repo>
cd jga-architectures

# 2. Dépendances
npm install

# 3. Variables d'environnement
cp .env.example .env
# Remplir VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY

# 4. Base de données
# Dans le dashboard Supabase > SQL Editor, exécuter :
# supabase/migrations/001_init.sql

# 5. Lancer en développement
npm run dev
```

L'app est disponible sur http://localhost:5173

---

## Structure des fichiers

```
src/
├── core/          Auth, Layout (AppShell, Sidebar, Topbar), Router, Supabase client
├── modules/       Modules par affaire (chantier, planning, financier, todo)
│   └── manifest.js   ← ajouter un module ici
├── tools/         Outils transversaux (rastérisation, analyseur, heures)
│   └── manifest.js   ← ajouter un outil ici
├── dashboard/     Grille des affaires + panneau de détail
└── shared/        Composants et hooks réutilisables
```

### Ajouter un module

1. Créer `src/modules/mon-module/index.jsx` (export default)
2. Ajouter une entrée dans `src/modules/manifest.js`
3. Le module apparaît automatiquement dans le router et le panneau de détail.

### Ajouter un outil

1. Créer `src/tools/mon-outil/index.jsx` (export default)
2. Ajouter une entrée dans `src/tools/manifest.js`
3. L'outil apparaît automatiquement dans la page /tools.

---

## Supabase — configuration

### 1. Créer le projet
Sur [supabase.com](https://supabase.com), créer un nouveau projet.

### 2. Exécuter la migration
Dans **SQL Editor** du dashboard Supabase, coller et exécuter le contenu de :
```
supabase/migrations/001_init.sql
```

### 3. Auth
Dans **Authentication > Settings**, activer le provider Email/Password.  
Créer les comptes collaborateurs dans **Authentication > Users**.

---

## Build de production

```bash
npm run build
# Le dossier dist/ contient l'app prête à déployer
```

---

## Déploiement sur Vercel

### Prérequis
- Compte [Vercel](https://vercel.com)
- Repository GitHub/GitLab avec le projet

### Étapes

**1. Pousser le code sur GitHub**
```bash
git add .
git commit -m "ready for deployment"
git push origin main
```

**2. Importer sur Vercel**
- Sur vercel.com → **New Project** → importer le repository GitHub

**3. Configuration du projet**

| Paramètre | Valeur |
|---|---|
| Framework Preset | **Vite** |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

**4. Variables d'environnement** (onglet *Environment Variables*)

| Nom | Valeur |
|---|---|
| `VITE_SUPABASE_URL` | URL de votre projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clé `anon` publique Supabase |

**5. Cliquer Deploy**

### Après le déploiement — configuration Supabase

Dans **Supabase → Authentication → URL Configuration** :

- **Site URL** : `https://[votre-projet].vercel.app`
- **Redirect URLs** : `https://[votre-projet].vercel.app/**`

Sans cette configuration, les liens de confirmation d'email et les redirections OAuth échouent.

### Routing SPA

Le fichier `vercel.json` à la racine redirige toutes les routes vers `index.html` — indispensable pour React Router.

---

## PWA — Installation sur iPad

1. Ouvrir l'URL dans Safari
2. Icône de partage → **Ajouter à l'écran d'accueil**
3. L'app se lance en mode standalone (sans barre d'URL)

---

## Charte graphique

| Variable | Valeur | Usage |
|---|---|---|
| `--jga-orange` | `#E05A1E` | Accent principal, CTAs |
| `--jga-orange-light` | `#FAF0EB` | Fonds hover, sélections |
| `--jga-orange-mid` | `#F0997B` | Bordures hover |
| `--jga-beige` | `#9B8F85` | Textes secondaires |
| `--jga-beige-light` | `#F5F2F0` | Fonds neutres |
