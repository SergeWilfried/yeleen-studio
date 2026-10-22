import { jetons, useJobs } from '../lib/jobs.jsx'
import { useRecharge } from '../lib/rechargeDialog.jsx'
import Cauri from './Cauri.jsx'

/** Solde de cauris et nombre de générations en cours, visibles depuis tous les outils. Ouvre la recharge. */
export default function BalanceChip() {
  const { balance, running, queued } = useJobs()
  const { openRecharge } = useRecharge()
  const busy = running + queued
  return (
    <button type="button" className="bal" aria-haspopup="dialog" onClick={() => openRecharge()} aria-label={`Solde : ${jetons(balance)} cauris${busy ? `, ${busy} génération${busy > 1 ? 's' : ''} en cours` : ''}. Recharger`}>
      <Cauri size={16} />
      <b>{jetons(balance)}</b>
      {busy > 0 && <span className="bal-busy"><i />{busy} en cours</span>}
    </button>
  )
}
