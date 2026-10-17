import Icon from '../../lib/icons.jsx'
import { gradient } from '../../lib/gradients.js'
import { jetonLabel, useJobs } from '../../lib/jobs.jsx'
import { useAssets } from '../../lib/assets.jsx'
import { useToast } from '../../lib/toasts.jsx'
import Menu from '../Menu.jsx'
import SendToMenu, { downloadAsset } from '../SendToMenu.jsx'
import { AssetActions, FailureNotice, RefundNote, StatusLine, isActive } from './shared.jsx'

/**
 * Une demande d'image, sans cadre autour : la description, une ligne d'état animée, puis les images à leur
 * taille finale (une seule : large ; plusieurs : grille de 2 colonnes). Le résultat se fond dans l'emplacement,
 * suivi d'une rangée de réactions (j'aime, je n'aime pas, régénérer, partager, plus).
 */
export default function ImageBatch({ job }) {
  const { running, rerun, dismiss } = useJobs()
  const lib = useAssets()
  const toast = useToast()
  const done = job.status === 'COMPLETED'
  const outputs = done ? lib.byJob(job.key) : []
  const n = job.seeds.length
  const failed = job.status === 'FAILED' || job.status === 'CANCELED'
  const reaction = outputs[0]?.reaction ?? null
  const react = (r) => outputs.forEach((a) => lib.update(a.id, { reaction: reaction === r ? null : r }))
  const moreItems = [
    { id: 'copy', icon: 'copy', title: 'Copier la description' },
    { id: 'dl', icon: 'download', title: n > 1 ? 'Télécharger les images' : 'Télécharger l’image' },
    { id: 'rm', icon: 'trash', title: 'Retirer de la liste' },
  ]
  const onMore = async (id) => {
    if (id === 'copy') { try { await navigator.clipboard.writeText(job.prompt); toast('Description copiée') } catch { toast('Copie impossible') } }
    else if (id === 'dl') { try { for (const a of outputs) await downloadAsset(lib, a) } catch { toast('Téléchargement impossible : fichier introuvable.') } }
    else dismiss(job.id)
  }

  return (
    <li className={`ib ib-${job.status.toLowerCase().replace('_', '-')}`}>
      {job.prompt && <p className="ib-prompt">{job.prompt}</p>}
      {job.meta && <span className="ib-meta">{job.meta}</span>}

      {failed ? (
        <div className="ib-fail"><div><FailureNotice job={job} /><RefundNote job={job} /></div><AssetActions job={job} dir="row" className="inline" /></div>
      ) : (
        <>
          {isActive(job) && (
            <p className="ib-status" role="status">
              <span className="ib-mark" aria-hidden="true"><i /><i /><i /></span>
              {job.status === 'IN_QUEUE' ? `En file d’attente · n° ${job.queuePosition}` : n > 1 ? `Création de vos ${n} images…` : 'Création de votre image…'}
            </p>
          )}
          <div className="ib-stage">
            <div className={`ib-grid${n === 1 ? ' one' : ''}`}>
              {job.seeds.map((seed, i) => (
                <div key={i} className={`ib-tile${job.status === 'IN_QUEUE' ? ' wait' : ''}${done ? ' done' : ''}`} role="img" aria-label={done ? `Image générée ${i + 1}` : `Image ${i + 1} en cours`}>
                  <span className="ib-ph" aria-hidden="true" style={{ '--tint': gradient(seed + i, 'image') }} />
                  <span className="ib-art" style={{ background: gradient(seed + i, 'image') }} />
                  {done && outputs[i]?.url && <img className="ib-img" src={outputs[i].url} alt={`Image générée ${i + 1} : ${job.prompt}`} />}
                  {done && n > 1 && outputs[i] && <span className="send-slot"><SendToMenu asset={outputs[i]} iconOnly /></span>}
                </div>
              ))}
            </div>
            {isActive(job) && <AssetActions job={job} className="ib-act" />}
          </div>

          {done && (
            <div className="ib-react" role="group" aria-label="Réactions">
              <button type="button" aria-pressed={reaction === 'up'} aria-label="J’aime" title="J’aime" onClick={() => react('up')}><Icon name="thumbUp" size={19} fill={reaction === 'up' ? 'currentColor' : 'none'} /></button>
              <button type="button" aria-pressed={reaction === 'down'} aria-label="Je n’aime pas" title="Je n’aime pas" onClick={() => react('down')}><Icon name="thumbDown" size={19} fill={reaction === 'down' ? 'currentColor' : 'none'} /></button>
              <button type="button" aria-label={`Régénérer (${jetonLabel(job.cost)})`} title={`Régénérer · ${jetonLabel(job.cost)}`} onClick={() => rerun(job)}><Icon name="revert" size={19} /></button>
              {n === 1 && outputs[0] && <SendToMenu asset={outputs[0]} iconOnly icon="share" title="Envoyer vers" className="ib-rb" />}
              <Menu items={moreItems} value={null} onChange={onMore} label="Plus d’options" menuWidth={240} className="send icon ib-rb">
                <Icon name="dots" size={19} />
              </Menu>
              <span className="gx-detail"><StatusLine job={job} running={running} /></span>
            </div>
          )}
        </>
      )}
      {isActive(job) && <p className="gx-detail"><StatusLine job={job} running={running} /></p>}
    </li>
  )
}
