const express = require('express')
const shell = require('shelljs')
const bodyParser = require('body-parser')
const textParser = bodyParser.text()
const cp = require('child-process-promise')
const request = require('request-promise-native')
const fs = require('fs')
const util = require('util')
const path = require('path')

const app = express()

const container = process.env.DOCKER_CONTAINER || 'elegant_kowalevski'

app.post('/license/url', textParser, (req, res, next) => {
  const url = req.body

  ;(isGitRepo(url)
   ? analyzeGitRepo(url)
   : request(url).then(body => analyzeFileContents(`temp/${fileNameForUrl(url)}`, body)))
    .then(results => res.send(results))
    .catch(next)
})

app.listen(3000, () => {
  console.log('Listening on 3000')
})

const writeFile = util.promisify(fs.writeFile)

function analyzeFile(localFile) {
  const fileName = path.basename(localFile)
  const cmd = (tmpdir, agent) => `docker exec -i ${container} /usr/local/etc/fossology/mods-enabled/${agent}/agent/${agent} ${tmpdir}/${fileName}`

  const init = () =>
        cp.exec(`docker exec ${container} mktemp -d`).then(pickStdout)

  const cleanup = (x, tmpdir) =>
        cp.exec(`docker exec ${container} rm -rf ${tmpdir}`)
        .then(cp.exec(`rm ${localFile}`))
        .then(() => x)

  return init()
    .then(tmpdir => cp.exec(`docker cp ${localFile} ${container}:${tmpdir}/${fileName}`)
          .then(() => cp.exec(cmd(tmpdir, 'nomos')).then(pickStdout))
          .then(nomosStdout => cp.exec(cmd(tmpdir, 'monk')).then(pickStdout)
                .then(monkStdout => {
                  const monkOutput = 'According to monk: ' + monkStdout
                  const nomosOutput = 'According to nomos: ' + nomosStdout
                  return `
${monkOutput}
${nomosOutput}
`
                })).then((x) => cleanup(x, tmpdir))
          .catch((x) => cleanup(x, tmpdir))
         )
}

function analyzeFileContents(localFile, contents) {
  return writeFile(localFile, contents).then(() => analyzeFile(localFile))
}

function analyzeGitRepo(url) {
  return cp.exec('mktemp -d').then(pickStdout).then(tmpdir => {
    return cp.exec(`cd ${tmpdir} && git clone ${cleanGitUrl(url)}`)
      .then(() => cp.exec(`find ${tmpdir} -name .git -prune -or -type f -print`).then(pickStdout))
      .then(lines => lines.split('\n'))
      .then(files => Promise.all(files.map(analyzeFile)))
      .then(outputs => outputs.join('\n'))
      .then(output => { cp.exec(`rm -rf ${tmpdir}`); return output })
  })
}


function fileNameForUrl(url) {
  return path.basename(require('url').parse(url).pathname)
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

function pickStdout({ stdout }) { return stdout.trim() }
