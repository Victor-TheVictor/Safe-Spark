import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveSparkyNavigationAction, SPARKY_APP_ACTIONS } from './sparkyActions.js'

test('only allowlisted, explicit navigation intents resolve', () => {
  assert.equal(resolveSparkyNavigationAction('Please open the safety map')?.path, '/map')
  assert.equal(resolveSparkyNavigationAction('Open MAP!')?.path, '/map')
  assert.equal(resolveSparkyNavigationAction('emergency contacts')?.path, '/contacts')
  assert.equal(resolveSparkyNavigationAction('/admin'), null)
  assert.equal(resolveSparkyNavigationAction(null), null)
  assert.deepEqual(SPARKY_APP_ACTIONS.map(({ path }) => path), ['/', '/map', '/crime-log', '/safety-gear', '/contacts', '/profile'])
})
