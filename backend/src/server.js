import { createApp } from './app.js';
import { config } from './config.js';
import { demarrerEntretienAutomatique } from './services/entretienService.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`zanziGo API démarrée sur http://localhost:${config.port}/api`);
  // Entretien automatique (places impayées, annonces parties) : sans lui,
  // le ménage n'avait lieu QUE lorsqu'un client ou l'équipe ouvrait une
  // page — une place réservée et non payée pouvait rester bloquée des
  // heures, invendable pour les autres voyageurs.
  demarrerEntretienAutomatique();
});
