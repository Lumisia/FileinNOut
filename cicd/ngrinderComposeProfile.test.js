import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const profilePath = resolve(repoRoot, 'docker-compose.ngrinder.yml')
const agentConfigPath = resolve(repoRoot, 'cicd', 'ngrinder-agent.conf')

test('local nGrinder profile isolates the requested load-test stack', () => {
  assert.equal(existsSync(profilePath), true, 'nGrinder Compose override should exist')

  const profile = readFileSync(profilePath, 'utf8')
  assert.match(profile, /backend-app:[\s\S]*cpus:\s*2\.0[\s\S]*mem_limit:\s*2g/)
  assert.match(profile, /depends_on:\s*!override[\s\S]*redis:[\s\S]*db:/)
  assert.match(profile, /MINIO_CLOUD_BUCKET:\s*""/)
  assert.match(profile, /MINIO_WORKSPACE_BUCKET:\s*""/)
  assert.match(profile, /image:\s*ngrinder\/controller:3\.5\.9-p1/)
  assert.match(profile, /"8300:80"/)
  assert.match(profile, /image:\s*ngrinder\/agent:3\.5\.9-p1/)
  assert.match(profile, /command:\s*\["ngrinder-controller:80"\]/)
  assert.match(profile, /\.\/cicd\/ngrinder-agent\.conf:\/opt\/ngrinder-agent\/\.ngrinder-agent\/agent\.conf:ro/)
  assert.match(profile, /ngrinder-agent-2:[\s\S]*container_name:\s*waffle-ngrinder-agent-2/)
  assert.match(profile, /ngrinder-agent-2:[\s\S]*ngrinder_agent_2_data:\/opt\/ngrinder-agent/)
  assert.match(profile, /ngrinder_controller_data:/)
  assert.match(profile, /ngrinder_agent_data:/)
  assert.match(profile, /ngrinder_agent_2_data:/)

  assert.equal(existsSync(agentConfigPath), true, 'nGrinder agent config should exist')
  assert.match(readFileSync(agentConfigPath, 'utf8'), /^agent\.enable_local_dns=false$/m)
})
