import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`zanziGo API démarrée sur http://localhost:${config.port}/api`);
});
