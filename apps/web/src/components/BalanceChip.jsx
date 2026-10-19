import { Link } from 'react-router-dom'
import Icon from '../lib/icons.jsx'
import { jetons, useJobs } from '../lib/jobs.jsx'

/** Solde de jetons et nombre de générations en cours, visibles depuis tous les outils. Mène à la recharge. */
export default function BalanceChip() {
  const { balance, running, queued } = useJobs()
  const busy = running + queued
  return (
    <Link to="/recharge" className="bal" aria-label={`Solde : ${jetons(balance)} cauris${busy ? `, ${busy} génération${busy > 1 ? 's' : ''} en cours` : ''}. Recharger`}>
      <Icon name="sparkle" size={14} />
      <b>{jetons(balance)}</b>
      {busy > 0 && <span className="bal-busy"><i />{busy} en cours</span>}
    </Link>
  )
}
