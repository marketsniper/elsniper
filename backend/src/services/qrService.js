import { randomUUID } from 'node:crypto';

// Deux types de QR distincts :
// - QR véhicule : fixe, généré une seule fois à la validation du chauffeur.
// - QR colis : unique par colis, généré à la création de la demande.
// Le rendu visuel (image) se fait côté app avec une lib type qrcode /
// react-native-qrcode-svg — le serveur ne stocke que la valeur.

export const generateVehicleQr = () => `VEH-${randomUUID()}`;

export const generatePackageQr = () => `PKG-${randomUUID()}`;
