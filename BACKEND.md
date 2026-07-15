# Backend Shefory — Supabase

Backend de la marketplace **Shefory** (chauffeurs ↔ clients), sur **Supabase** (PostgreSQL + Auth + Storage + Realtime).

## Projet

- **Nom** : `shefory` · **Région** : `eu-west-3` (Paris, faible latence Afrique de l'Ouest)
- **Ref projet** : `pmtqyiriapzlpqcxuleo`
- **API URL** : `https://pmtqyiriapzlpqcxuleo.supabase.co`
- **Clé publishable (publique, côté navigateur)** : `sb_publishable_MZmFVPmsSBpwcTZCmLXJug_zBf5yl7b`
  (voir `js/supabase.js`. La sécurité repose sur la **RLS**, pas sur le secret de la clé.)

> Le projet `institut-helix` a été mis en pause pour libérer un slot gratuit (données conservées, réactivable depuis le dashboard).

## Rôles & authentification

- Auth Supabase (email + mot de passe). À l'inscription, un **profil** est créé automatiquement (trigger `handle_new_user`).
- Rôle porté par `profiles.role` : **`client`** (défaut) · **`driver`** · **`admin`**.
  Le rôle se passe dans les métadonnées d'inscription : `{ "role": "driver", "full_name": "…" }`.

## Modèle de données (`public`)

| Table | Rôle |
|---|---|
| `profiles` | Compte (privé) : rôle, nom, téléphone, ville. Clé = `auth.users.id`. |
| `drivers` | **Annuaire public** : véhicule, zones, tarif, note, vérification, `pack_tier`, `rank_score`. |
| `driver_photos` | Photos véhicule (bucket public `driver-photos`). |
| `driver_documents` | Permis/carte grise/assurance (bucket **privé** `driver-docs`) pour le badge vérifié. |
| `subscription_packs` | Catalogue Bronze / Argent / Or (prix FCFA, poids classement, features). |
| `subscriptions` | Abonnement actif d'un chauffeur (1 actif max, lié à un moyen Mobile Money). |
| `payments` | Miroir des transactions (montant FCFA, méthode, statut) — alimente l'admin. |
| `conversations` | Fil client↔chauffeur (noms dénormalisés, dernier message, non-lus). |
| `messages` | Messages `text` / `offer` (négociation de tarif). **Realtime activé.** |
| `reviews` | Avis (1–5) → recalcul auto de `drivers.rating` / `reviews_count`. |
| `disputes` | Litiges à arbitrer (priorité, statut), code auto `L-…`. |
| `audit_log` | Journal d'actions sensibles (lecture admin). |

### Classement (`drivers.rank_score`, colonne générée)

```
rank_score = poids_pack (Or 3000 / Argent 2000 / Bronze 1000 / gratuit 0)
           + rating × 100
           + response_rate
           + (verified ? 50 : 0)
```

Le pack actif est synchronisé automatiquement sur `drivers.pack_tier` par trigger dès qu'un
abonnement change (`sync_driver_pack`) → le classement se met à jour tout seul.

## Sécurité (RLS)

RLS activée partout. En résumé :
- `profiles` : chacun voit **son** profil ; l'admin voit tout.
- `drivers` / `driver_photos` / `reviews` / `subscription_packs` : **lecture publique** ; écriture réservée au propriétaire (ou admin).
- `driver_documents` : visibles **seulement** par le chauffeur concerné et l'admin.
- `subscriptions` / `payments` : le chauffeur voit les siens ; l'admin gère.
- `conversations` / `messages` : **participants uniquement** (+ admin).
- `disputes` : parties concernées + admin.
- Helpers `SECURITY DEFINER` : `is_admin()`, `is_conversation_member()`.

Advisors sécurité : les seuls WARN restants concernent `is_admin` / `is_conversation_member`
(nécessaires à la RLS, ne renvoient que des infos sur l'appelant lui-même).

## Storage (buckets)

- `avatars` (public) · `driver-photos` (public) · `driver-docs` (**privé**).
- Upload autorisé dans le dossier `{user_id}/…` ; les documents privés ne sont lisibles que par leur propriétaire/admin (URL signées).

## Comptes de démo (mot de passe : `shefory123`)

| Email | Rôle | Pack |
|---|---|---|
| `ibrahima@demo.shefory.app` | chauffeur | Or |
| `aicha@demo.shefory.app` | chauffeur | Argent |
| `kwame@demo.shefory.app` | chauffeur | Or |
| `fatou@demo.shefory.app` | chauffeur | Bronze |
| `moussa@demo.shefory.app` | chauffeur | gratuit (non vérifié) |
| `client@demo.shefory.app` | client | — |
| `admin@demo.shefory.app` | admin | — |

## État du câblage front

- ✅ **Recherche / annuaire** (`index.html`) : lit les chauffeurs en direct via l'API REST, triés par `rank_score`. Repli automatique sur des données de démo locales si l'API est injoignable.
- ⏳ **À câbler ensuite** : inscription/connexion (Auth), messagerie temps réel (Realtime), abonnements (checkout Mobile Money), admin (`admin.html`).

## Migrations appliquées

`0001_foundations_profiles_auth_rls` · `0002_drivers_directory_storage` ·
`0003_subscriptions_packs_payments` · `0004_messaging_realtime` ·
`0005_reviews_disputes_audit` · `0006_harden_functions` · `0007_seed_demo`

(Historique conservé côté Supabase ; récupérable via `supabase db pull`.)
