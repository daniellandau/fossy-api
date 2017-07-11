const express = require('express')
const shell = require('shelljs')
const bodyParser = require('body-parser')
const textParser = bodyParser.text()
const cp = require('child-process-promise')
const request = require('request-promise-native')
const fs = require('fs')
const util = require('util')

const app = express()

const container = process.env.DOCKER_CONTAINER || 'elegant_kowalevski'

app.post('/license/url', textParser, (req, res, next) => {
  const url = req.body
  request(url)
    .then(body => analyzeFile(fileNameForUrl(url), body))
    .then(results => res.send(results))
    .catch(next)
})

app.listen(3000, () => {
  console.log('Listening on 3000')
})

const writeFile = util.promisify(fs.writeFile)

function analyzeFile(fileName, contents) {
  const localFile = `temp/${fileName}`
  const cmd = (tmpdir, agent) => `docker exec -i ${container} /usr/local/etc/fossology/mods-enabled/${agent}/agent/${agent} ${tmpdir}/${fileName}`

  const pickStdout = ({ stdout }) => stdout

  const init = () =>
        cp.exec(`docker exec ${container} mktemp -d`).then(pickStdout).then(x => x.replace(/\s/g, ''))

  const cleanup = (x, tmpdir) =>
        cp.exec(`docker exec ${container} rm -rf ${tmpdir}`)
        .then(cp.exec(`rm ${fileName}`))
        .then(() => x)

  return writeFile(localFile, contents)
    .then(init)
    .then((tmpdir) => cp.exec(`docker cp ${localFile} ${container}:${tmpdir}/${fileName}`)
          .then(() => cp.exec(cmd(tmpdir, 'nomos')).then(pickStdout))
          .then(nomosStdout => cp.exec(cmd(tmpdir, 'monk')).then(pickStdout)
                .then(monkStdout => {
                  const monkOutput = 'According to monk: ' + monkStdout
                  const nomosOutput = 'According to nomos: ' + nomosStdout
                  console.log('faoeuaoeu')
                  return `
${monkOutput}
${nomosOutput}
`
                })).then((x) => cleanup(x, tmpdir))
          .catch((x) => cleanup(x, tmpdir))
         )
}

function fileNameForUrl(url) {
  return require('path').basename(require('url').parse(url).pathname)
}

function isGitRepo(url) {
  return url.endsWith('.git') || isGithubRepo(url)
}

function isGithubRepo(url) {
  return /^https:\/\/github.com\/\w+\/\w+$/.test(url)
}

function cleanGitUrl(url) {
  if (!isGitRepo(url)) throw new Error('Called with non git url:', url)

  if (!isGithubRepo(url)) return url

  return url + '.git'
}
