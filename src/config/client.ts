/**
 * Deployment configuration.
 *
 * This app runs one instance per client agency, each with its own Supabase
 * project and its own Vercel project. Everything that names the operator lives
 * here, so no component references a brand directly.
 *
 * The platform brand is AVI Soccer — the desk is presented as our product
 * serving the agency, not white-labelled as the agency's own.
 */

export interface ClientConfig {
  /** Stable slug. Used for ids and filenames, never displayed. */
  id: string;
  // The sidebar, header and login screen render the logo itself now, so there
  // is no wordmark string. `pdfBrandMark` below is separate and still used: a
  // document sets the name in type beside the mark.
  /** Short name used in records and defaults. */
  shortName: string;
  /** Full legal entity name. */
  legalName: string;
  /**
   * Desk label shown beside the logo and on the login screen.
   *
   * Whose desk this is, not what kind of desk it is — an agency's book belongs
   * to the agent who runs it.
   */
  deskName: string;
  /** Logo path, relative to the public/ root. */
  logoPath: string;
  /** Reversed logo, for dark surfaces. */
  logoPathReversed: string;
  /** Uppercase mark stamped on exported PDFs. */
  pdfBrandMark: string;
  /** Confidentiality line printed in PDF footers. */
  pdfConfidentialityNote: string;
  /** Reporting currency and the FX rates financials are converted at. */
  currency: string;
  eurToBrl: number;
  usdToBrl: number;
}

const aviSoccer: ClientConfig = {
  id: 'avi-soccer',
  shortName: 'AVI Soccer',
  legalName: 'AVI Soccer',
  deskName: 'Julio Taran',
  logoPath: '/brand/avi-soccer-primary-horizontal.png',
  logoPathReversed: '/brand/avi-soccer-primary-horizontal-white.png',
  pdfBrandMark: 'AVI SOCCER',
  pdfConfidentialityNote: 'Confidential — prepared for the named recipient',
  currency: 'EUR',
  eurToBrl: 6.0,
  usdToBrl: 5.5,
};

const CLIENTS: Record<string, ClientConfig> = {
  'avi-soccer': aviSoccer,
};

/**
 * Selected at build time via VITE_CLIENT_ID. Unset resolves to AVI Soccer.
 */
const configuredId = import.meta.env.VITE_CLIENT_ID ?? 'avi-soccer';

export const CLIENT: ClientConfig = CLIENTS[configuredId] ?? aviSoccer;
