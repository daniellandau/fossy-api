const express = require('express')
const shell = require('shelljs')
const bodyParser = require('body-parser')
const textParser = bodyParser.text()
const cp = require('child-process-promise')
const request = require('request-promise-native')
const fs = require('fs')
const util = require('util')
const path = require('path')
const promiseLimit = require('promise-limit')
const limit = promiseLimit(4)

const app = express()

const container = process.env.DOCKER_CONTAINER || 'elegant_kowalevski'

app.post('/license/url', textParser, (req, res, next) => {
  const url = req.body

  if (isGitRepo(url))
    analyzeGitRepo(url, req, res).catch(next)
  else
    request(url).then(body => analyzeFileContents(`temp/${fileNameForUrl(url)}`, body))
    .then(results => res.send(results))
    .catch(next)
})

app.listen(3000, () => {
  console.log('Listening on 3000')
})

const writeFile = util.promisify(fs.writeFile)

function analyzeFile(localFile) {
  const fileName = path.basename(localFile)
  console.log('analyzing', fileName)
  const cmd = (tmpdir, agent) =>
        cp.spawn('docker',
                 [ 'exec', '-i', container, `/usr/local/etc/fossology/mods-enabled/${agent}/agent/${agent}`, `${tmpdir}/${fileName}` ],
                 { capture: [ 'stdout' ]}).then(pickStdout)

  const init = () =>
        cp.exec(`docker exec ${container} mktemp -d`).then(pickStdout)

  const cleanup = (x, tmpdir) =>
        cp.exec(`docker exec ${container} rm -rf ${tmpdir}`)
        .then(() => cp.exec(`rm ${localFile}`))
        .then(() => x)

  return init()
    .then(tmpdir => cp.spawn('docker', ['cp', localFile, `${container}:${tmpdir}/${fileName}`])
          .then(() => cmd(tmpdir, 'nomos'))
          .then(nomosStdout =>  cmd(tmpdir, 'monk')
                .then(monkStdout => cmd(tmpdir, 'copyright')
                      .then(copyrightStdout => {
                        console.log('output', fileName)
                        return {
                          monk: monkStdout,
                          nomos: nomosStdout,
                          copyright: copyrightStdout
                        }
                      }))).then((x) => cleanup(x, tmpdir))
          .catch((x) => cleanup(x, tmpdir))
         )
}

function analyzeFileContents(localFile, contents) {
  return writeFile(localFile, contents).then(() => analyzeFile(localFile))
}

function analyzeGitRepo(url, req, res) {
  let stillOpen = true
  req.on('close', () => { stillOpen = false })

  return cp.exec('mktemp -d').then(pickStdout).then(tmpdir => {
    return cp.exec(`cd ${tmpdir} && git clone ${cleanGitUrl(url)}`)
      .then(() => console.log('cloning done'))
      .then(() => mainLicenseForRepo(tmpdir).then(output => {
        res.write(`{ "main-license": ${JSON.stringify(output)},
  "file-licenses": [
`)
      }))
      .then(() => cp.exec(`find ${tmpdir} -name .git -prune -or -type f -print`).then(pickStdout))
      .then(output => output.split('\n'))
      .then(files => {
        const promises =
              files.map((file, i) => limit(() => stillOpen ? analyzeFile(file).then(output => res.write(`    { "file": ${JSON.stringify(file)}, "output": ${JSON.stringify(output)} }${i === files.length - 1 ? '' : ','}\n`)) : Promise.reject('uh oh')))
        return Promise.all(promises)
      })
      .then(() => res.write('  ]\n}'))
      .then(() => res.end())
      .then(() => cp.exec(`rm -rf ${tmpdir}`))
  })
}

function mainLicenseForRepo(dir) {
  return cp.exec(`find ${dir} -iname license\* -or -iname copying\*`)
    .then(pickStdout)
    .then(output => output.split('\n'))
    .then(files => files.sort((a, b) => a.length - b.length))
    .then(files => files.length > 0 ? analyzeFile(files[0]) : Promise.reslove('No main license found'))
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
