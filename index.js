const express = require('express')
const shell = require('shelljs')
const bodyParser = require('body-parser');
const textParser = bodyParser.text();
const cp = require('child_process');
const request = require('request-promise-native');

const app = express()

const container = process.env.DOCKER_CONTAINER || 'elegant_kowalevski'

app.post('/license/url', textParser, (req, res, next) => {
  const url = req.body
  request(url)
    .then(body => analyzeFile(body))
    .then(results => res.send(results))
    .catch(next)
})

app.listen(3000, () => {
  console.log('Listening on 3000')
})

function analyzeFile(contents) {
  const cmd = (agent) => `docker exec -i ${container} bash "-c" \'f=$(tempfile); cat >$f; /usr/local/etc/fossology/mods-enabled/${agent}/agent/${agent} $f\'`

  return new Promise((resolve, reject) => {
    const nomos = cp.exec(cmd('nomos'), (error, nomosStdout, stderr) => {
      if (error) return reject(error)
      const monk = cp.exec(cmd('monk'), (error, monkStdout, stderr) => {
        if (error) return reject(error)
        const monkOutput = 'According to monk: ' + monkStdout
        const nomosOutput = 'According to nomos: ' + nomosStdout
        return resolve(`
${monkOutput}
${nomosOutput}
`)
      })
      monk.stdin.write(contents)
      monk.stdin.end()
    })
    nomos.stdin.write(contents)
    nomos.stdin.end()
  })
}
