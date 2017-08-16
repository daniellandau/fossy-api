const express = require('express')
const shell = require('shelljs')
const bodyParser = require('body-parser')
const textParser = bodyParser.text()
const cp = require('child-process-promise')
const request = require('request-promise-native')
const fs = require('fs')
const util = require('util')
const path = require('path')
const timeout = require('connect-timeout')
const promiseLimit = require('promise-limit')
const limit = promiseLimit(4)

const app = express()

app.use('*', (req, res, next) => {
  req.connection.setTimeout(0)
  next()
})

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
  const cmd = (agent) =>
        cp.spawn(`/usr/local/etc/fossology/mods-enabled/${agent}/agent/${agent}`, [ '-J', localFile ],
                 { capture: [ 'stdout' ]}).then(pickStdout)

  const cleanup = (x) =>
        cp.spawn('rm', [ '-f', localFile ])
        .then(() => x)

  const scans = [
    cmd('nomos'),
    cmd('monk'),
    cmd('copyright'),
    cp.spawn('ninka', [ localFile ], { capture: [ 'stdout' ]}).then(pickStdout)
  ]

  return Promise.all(scans).then(([
    nomosStdout,
    monkStdout,
    copyrightStdout,
    ninkaStdout
  ]) => {
    console.log('output', fileName)
    const ninkaLicenses = ninkaStdout
          .split(';')[1].split(',')
    return {
      monk: JSON.parse(monkStdout),
      nomos: JSON.parse(nomosStdout),
      copyright: JSON.parse(copyrightStdout).results,
      ninka: ninkaLicenses
    }
  }).then((x) => cleanup(x))
    .catch((x) => cleanup(x))
}

function analyzeFileContents(localFile, contents) {
  return writeFile(localFile, contents).then(() => analyzeFile(localFile))
}

function analyzeGitRepo(url, req, res) {
  let stillOpen = true
  req.on('close', () => { stillOpen = false })

  return cp.exec('mktemp -d').then(pickStdout).then(tmpdir => {
    console.log('cloning ' + cleanGitUrl(url))
    return cp.spawn('git', [ 'clone', cleanGitUrl(url) ], { cwd: tmpdir })
      .then(() => console.log('cloning done'))
      .then(() => mainLicenseForRepo(tmpdir).then(output => {
        res.write(`{ "main-license": ${JSON.stringify(output)},
  "file-licenses": [
`)
      }))
      .then(() => cp.exec(`find ${tmpdir} -name .git -prune -or -type f -print`, { maxBuffer: 10000*1024}).then(pickStdout))
      .then(output => output.split('\n'))
      .then(files => {
        // keep tabs of output order with shared index
        let i = 0;
        const promises =
              files.map((file) => limit(() => {
                return stillOpen
                  ? analyzeFile(file)
                  .then(output => {
                    res.write(`    { "file": ${JSON.stringify(file.replace(tmpdir, ''))}, "output": ${JSON.stringify(output)} }${i === files.length - 1 ? '' : ','}\n`)
                    ++i;
                  })
                : Promise.reject('uh oh') }))
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
    .then(files => files.sort((a, b) => a.length - b.length).filter(x => x.length > 0))
    .then(files => files.length > 0 ? analyzeFile(files[0]) : Promise.resolve({ monk: [], ninka: [], nomos: [], copyright: []}))
}


function fileNameForUrl(url) {
  return path.basename(require('url').parse(url).pathname)
}

function isGitRepo(url) {
  return url.endsWith('.git') || isGithubRepo(url) || isAndroidSourceRepo(url)
}

function isGithubRepo(url) {
  return /^https:\/\/github.com\/[^/]+\/[^/]+$/.test(url)
}

function isAndroidSourceRepo(url) {
  return url.startsWith('https://android.googlesource.com/')
}

function cleanGitUrl(url) {
  if (!isGitRepo(url)) throw new Error('Called with non git url:', url)

  if (!isGithubRepo(url)) return url

  return url + '.git'
}

function pickStdout({ stdout }) { return stdout.trim() }
