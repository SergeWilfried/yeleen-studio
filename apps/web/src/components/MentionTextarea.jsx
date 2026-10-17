import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import AssetThumb from './AssetThumb.jsx'
import '../styles/mention.css'

const OPEN = /(^|\s)@([^\s@]*)$/ // « @ » en début de texte ou après un espace, suivi de ce qui est déjà tapé

/**
 * Zone de texte où « @ » ouvre la liste des références proposées (`items`) ; en choisir une insère son mot-clé.
 *
 * - `items` : [{ key, token, label, sub, asset }] ; `token` est le texte inséré après « @ » (« flux-3 », « Image 2 »…).
 * - `pattern` : expression (sans « @ ») qui décrit un mot-clé dans le texte ; `isRef(token)` dit s'il désigne bien une référence.
 * - `roles` : { mot-clé: rôle } ; une référence « unused » est grisée.
 * - `onPick(item)` : appelé quand une référence est choisie dans la liste.
 *
 * Les références s'affichent surlignées dans le texte : une couche identique est dessinée derrière la zone de saisie
 * (dont le texte est transparent), la zone grandit avec son contenu pour que les deux restent alignées.
 * Retour arrière juste après une référence : elle part en entier. Expose `focus()` et `insertAt(text?)`.
 */
const MentionTextarea = forwardRef(function MentionTextarea({ value, onChange, items = [], pattern = '[\\w-]+', isRef, roles = {}, onPick, emptyHint, ...rest }, ref) {
  const ta = useRef(null)
  const back = useRef(null)
  const wrap = useRef(null)
  const [menu, setMenu] = useState(null) // { start, caret, query, box }
  const [index, setIndex] = useState(0)
  const tokenRe = useMemo(() => new RegExp(`(@${pattern})`, 'g'), [pattern])
  const endRe = useMemo(() => new RegExp(`@(${pattern}) ?$`), [pattern])

  // La zone suit la hauteur de son texte. Si l'écran fixe une hauteur maximale (--mt-max), elle défile en interne
  // (barre masquée, pour que les deux couches gardent la même largeur) et la couche de surlignage suit le défilement.
  const sync = () => { if (back.current && ta.current) back.current.scrollTop = ta.current.scrollTop }
  useLayoutEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
    const capped = el.scrollHeight > el.clientHeight + 1
    wrap.current.toggleAttribute('data-capped', capped)
    sync()
  }, [value])

  const results = useMemo(() => {
    if (!menu) return []
    const q = menu.query.toLowerCase()
    return items.filter((it) => !q || `${it.label} ${it.sub ?? ''} ${it.token}`.toLowerCase().includes(q)).slice(0, 8)
  }, [menu, items])

  const detect = (text, caret) => {
    const m = OPEN.exec(text.slice(0, caret))
    if (!m) return setMenu(null)
    const r = ta.current.getBoundingClientRect()
    const below = window.innerHeight - r.bottom
    setMenu({ start: caret - m[2].length - 1, caret, query: m[2], box: below < 260 && r.top > below ? { bottom: window.innerHeight - r.top + 6, left: r.left, width: Math.max(r.width, 280) } : { top: r.bottom + 6, left: r.left, width: Math.max(r.width, 280) } })
    setIndex(0)
  }

  const pick = (item) => {
    onPick?.(item)
    const next = `${value.slice(0, menu.start)}@${item.token} ${value.slice(menu.caret)}`
    const caret = menu.start + item.token.length + 2
    onChange(next)
    setMenu(null)
    requestAnimationFrame(() => { ta.current?.focus(); ta.current?.setSelectionRange(caret, caret) })
  }

  useImperativeHandle(ref, () => ({
    focus: () => ta.current?.focus(),
    /** Insère « @ » au curseur (ouvre la liste), ou directement un mot-clé si `token` est donné. */
    insertAt(token) {
      const el = ta.current
      const pos = el.selectionStart ?? value.length
      const before = value.slice(0, pos)
      const gap = before && !/\s$/.test(before) ? ' ' : ''
      const ins = token ? `@${token} ` : '@'
      const next = `${before}${gap}${ins}${value.slice(pos)}`
      const caret = pos + gap.length + ins.length
      onChange(next)
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(caret, caret); if (!token) detect(next, caret) })
    },
  }))

  const onKeyDown = (e) => {
    // Retour arrière juste après une référence : on la retire d'un coup (sinon elle perdrait son surlignage lettre par lettre).
    if (e.key === 'Backspace' && !menu) {
      const el = ta.current
      if (el.selectionStart === el.selectionEnd) {
        const before = value.slice(0, el.selectionStart)
        const m = endRe.exec(before)
        if (m && isRef?.(m[1])) {
          e.preventDefault()
          const start = before.length - m[0].length
          onChange(value.slice(0, start) + value.slice(el.selectionStart))
          requestAnimationFrame(() => el.setSelectionRange(start, start))
          return
        }
      }
    }
    if (!menu || !results.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => (i + 1) % results.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => (i - 1 + results.length) % results.length) }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(results[index]) }
    else if (e.key === 'Escape') { e.preventDefault(); setMenu(null) }
  }

  const parts = value.split(tokenRe)
  return (
    <>
      <div className="mt-wrap" ref={wrap}>
        <div className="mt-back" aria-hidden="true" ref={back}>
          {parts.map((p, i) => (p.startsWith('@') && isRef?.(p.slice(1)) ? <mark key={i} className={roles[p.slice(1)] === 'unused' ? 'off' : undefined}>{p}</mark> : p))}
          {value.endsWith('\n') ? '​' : ''}
        </div>
        <textarea
          {...rest}
          className="mt-ta"
          ref={ta}
          value={value}
          onChange={(e) => { onChange(e.target.value); detect(e.target.value, e.target.selectionStart) }}
          onKeyDown={onKeyDown}
          onScroll={sync}
          onBlur={() => setMenu(null)}
          role="combobox"
          aria-expanded={Boolean(menu)}
          aria-autocomplete="list"
          aria-controls={menu ? 'mention-list' : undefined}
          aria-activedescendant={menu && results[index] ? `mention-${results[index].key}` : undefined}
        />
      </div>
      {menu && (
        <ul id="mention-list" className="mention" role="listbox" aria-label="Références" style={menu.box}>
          {results.length === 0 && <li className="mention-none" role="presentation">{items.length ? 'Aucune référence ne correspond.' : (emptyHint ?? 'Rien à citer pour l’instant.')}</li>}
          {results.map((it, i) => (
            <li key={it.key} id={`mention-${it.key}`} role="option" aria-selected={i === index} className={i === index ? 'on' : undefined} onMouseDown={(e) => { e.preventDefault(); pick(it) }} onMouseEnter={() => setIndex(i)}>
              <span className="mention-th">{it.asset && <AssetThumb asset={it.asset} />}</span>
              <span className="mention-tx"><b>{it.label}</b>{it.sub && <small>{it.sub}</small>}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
})
export default MentionTextarea
