// Erreur HTTP avec code métier stable, renvoyée telle quelle au client.
// Les codes sont documentés dans le README (section "Format des erreurs").
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (resource) =>
  new HttpError(404, 'not_found', `${resource} introuvable`);

export const invalidStatus = (message) =>
  new HttpError(409, 'invalid_status', message);
