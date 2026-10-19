import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countdown, errorMessage, expiryMs, failureText, isFinal, isOpen, limitError, lines, maskPhone, telHref, topupCountries, ussdCodes } from '../src/lib/topups.js'

test('consignes de paygate : français d’abord, liste ou texte', () => {
  assert.deepEqual(lines({ fr: ['Composez *144*4*6*5000#', ' '], en: ['Dial'] }), ['Composez *144*4*6*5000#'])
  assert.deepEqual(lines({ en: ['Dial'] }), ['Dial'])
  assert.deepEqual(lines('Validez sur votre téléphone'), ['Validez sur votre téléphone'])
  assert.deepEqual(lines(null), [])
})

test('codes USSD trouvés dans les consignes, lien d’appel avec # encodé', () => {
  assert.deepEqual(ussdCodes(['Composez *144*4*6*5000# puis', 'ou encore *144*4*6*5000#.']), ['*144*4*6*5000#'])
  assert.deepEqual(ussdCodes('Validez sur votre téléphone'), [])
  assert.equal(telHref('*144*4*6*5000#'), 'tel:*144*4*6*5000%23')
})

test('échéance : date ISO, millisecondes ou secondes ; compte à rebours jusqu’à zéro', () => {
  const now = Date.parse('2026-10-19T10:00:00Z')
  assert.equal(expiryMs('2026-10-19T10:15:00Z'), now + 15 * 60_000)
  assert.equal(expiryMs(now), now)
  assert.equal(expiryMs(now / 1000), now)
  assert.equal(expiryMs(null), null)
  assert.equal(countdown('2026-10-19T10:14:05Z', now), '14:05')
  assert.equal(countdown('2026-10-19T09:59:00Z', now), null)
  assert.equal(countdown(null, now), null)
})

test('statuts : ouverts et définitifs', () => {
  assert.ok(isOpen({ status: 'awaiting_code' }))
  assert.ok(!isOpen({ status: 'failed' }))
  assert.ok(isFinal({ status: 'expired' }))
  assert.ok(!isFinal({ status: 'processing' }))
})

test('messages : détails repris, codes inconnus et texte de l’opérateur', () => {
  assert.match(errorMessage({ status: 400, body: { error: 'invalid_phone' } }, { country: 'BF' }), /8 chiffres/)
  assert.match(errorMessage({ status: 429, body: { error: 'too_many_open', max: 3 } }), /3 recharges/)
  assert.match(errorMessage('amount_too_low', { min: 2000 }), /2\s000 FCFA/)
  assert.match(errorMessage({ status: 0, body: { error: 'unreachable' } }), /connexion/)
  assert.match(errorMessage({ status: 422, body: { error: 'quelque_chose' } }), /Vérifiez vos informations/)
  assert.equal(failureText('Solde insuffisant'), 'Solde insuffisant')
  assert.match(failureText('not_created'), /Rien n’a été débité/)
})

test('limites de /topups/options', () => {
  assert.equal(limitError({ available: true, min: 100, max: 1_000_000 }, 5000), null)
  assert.equal(limitError({ available: false }, 5000), 'unavailable')
  assert.equal(limitError({ available: true, min: 10_000 }, 5000), 'amount_too_low')
  assert.equal(limitError({ available: true, max: 2000 }, 5000), 'amount_too_high')
})

test('pays proposés et numéro masqué', () => {
  assert.deepEqual(topupCountries(undefined), ['BF'])
  assert.deepEqual(topupCountries('bf, ci,XX'), ['BF', 'CI'])
  assert.deepEqual(topupCountries('XX'), ['BF'])
  assert.equal(maskPhone('+22670123456'), '+226 •• •• 34 56')
})
