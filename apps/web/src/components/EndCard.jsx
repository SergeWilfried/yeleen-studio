import { digits } from '@studio/spot'

/** Carte finale d'un spot : logo, nom, offre, prix, WhatsApp. Couleurs via les variables --b0/--b1/--bt/--bi du parent. */
export default function EndCard({ title, offer, price, whatsapp, logoUrl, className = '' }) {
  return (
    <div className={`spp-end ${className}`}>
      {logoUrl && <img className="spp-logo" src={logoUrl} alt="" />}
      <strong className="spp-name">{title}</strong>
      <p>{offer}</p>
      {price && <b className="spp-price">{price}</b>}
      <span className="spp-wa">WhatsApp {whatsapp ? `+${digits(whatsapp)}` : '+…'}</span>
    </div>
  )
}
