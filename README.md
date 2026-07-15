# MonChauffeur — prototype cliquable

Marketplace qui connecte des **chauffeurs privés** avec des **personnes cherchant un chauffeur régulier**.
Prototype d'écrans (aucun backend pour l'instant) — pensé **mobile-first / PWA**, marché **Afrique francophone** (FCFA + Mobile Money).

## Ouvrir le prototype

Ouvre simplement les fichiers dans un navigateur (aucune installation) :

- **`index.html`** — l'app mobile (chauffeurs + clients). Sur ordinateur elle s'affiche dans un cadre de téléphone ; sur mobile, en plein écran (installable sur l'écran d'accueil).
- **`admin.html`** — l'app web d'administration.

## Parcours à tester

**Côté client** (bouton « Je cherche un chauffeur ») :
- Recherche + **classement** (les chauffeurs avec pack Or/Argent remontent, badge « Sponsorisé »)
- Fiche chauffeur détaillée (photos, avis, tarifs, vérifié ✅)
- **Messagerie** temps réel + **négociation** (bouton 💰 propose un tarif)

**Côté chauffeur** (bouton « Je suis chauffeur ») :
- Tableau de bord (vues, position au classement, complétion du profil)
- Écran **Abonnement** : packs Bronze / Argent / Or
- **Paiement Mobile Money simulé** (Wave, Orange Money, MTN, Moov) → confirmation

**Admin** (`admin.html`) : tableau de bord (MRR, revenus par mois, répartition par pack), **paiements**, **litiges**, **vérification des chauffeurs**.

## Packs (à valider / ajuster)

| Pack | Prix indicatif | Avantage classement |
|------|----------------|---------------------|
| Bronze | 3 000 FCFA/mois | Visible, classement standard |
| Argent | 7 000 FCFA/mois | 2× visibilité dans la zone, badge |
| Or (Premium) | 15 000 FCFA/mois | Top du classement + page d'accueil |

## Prochaines étapes (une fois le design validé)

1. Backend **Supabase** : schéma DB + Auth (rôles chauffeur/client/admin) + RLS
2. Profils chauffeurs + upload documents (badge vérifié)
3. Recherche + moteur de **classement** (pack + note + taux de réponse)
4. Messagerie **temps réel** (Supabase Realtime)
5. Paiements récurrents réels (**Stripe** et/ou agrégateur Mobile Money type Wave/PayDunya/CinetPay)
6. App web admin câblée (litiges, paiements, stats)
7. Conformité (RGPD/consentement, modération, anti-abus)

> Design system partagé dans `styles.css`. Icône/manifest PWA : `icon.svg`, `manifest.webmanifest`.
