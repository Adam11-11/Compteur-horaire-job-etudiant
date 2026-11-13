# TODO — Compteur Paella

## À faire
- [ ] **Notifications Web Push iOS (PWA + Supabase Edge Function / `pg_cron`)**
  - Bouton d'activation des rappels dans l'app + abonnement Push (`sw.js` + clés VAPID).
  - Envoi automatique de notifications aux jours et heures configurés si aucune saisie n'a encore été faite.
- [ ] **Déplacer la clé IA côté serveur (Supabase Edge Function)**
  - Stocker `GEMINI_API_KEY` dans **Supabase → Edge Functions → Secrets** (chiffré côté serveur, invisible côté client).
  - Créer une Edge Function relais (`gemini-proxy`) qui vérifie la session Supabase Auth et appelle Google Gemini.
  - Modifier `js/ai.js` et `index.html` pour appeler la Edge Function et supprimer le panneau de configuration de clé côté utilisateur (`#ai-config-panel`).

