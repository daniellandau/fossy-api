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
  request(url).then(body => {
    const nomos = cp.exec(`docker exec -i ${container} bash "-c" \'f=$(tempfile); cat >$f; /usr/local/etc/fossology/mods-enabled/nomos/agent/nomos $f\'`, (error, nomosStdout, stderr) => {
      const monk = cp.exec(`docker exec -i ${container} bash "-c" \'f=$(tempfile); cat >$f; /usr/local/etc/fossology/mods-enabled/monk/agent/monk $f\'`, (error, monkStdout, stderr) => {

        const monkOutput = 'According to monk: ' + monkStdout
        const nomosOutput = 'According to nomos: ' + nomosStdout
        res.send(`
${monkOutput}
${nomosOutput}
`)
      })
      monk.stdin.write(body)
      monk.stdin.end()
    })
    nomos.stdin.write(body)
    nomos.stdin.end()
  }).catch(next)
})

app.listen(3000, () => {
  console.log('Listening on 3000')
})
