# Fossy-api

This is a small HTTP wrapper around the scanners used in Fossology. The Fossology codebase is included as a submodule, so either clone recursively with `--recursive` or after cloning, run

```sh
git submodule init && git submodule update
```

To run locally

```sh
docker build . -t fossy-api
docker run -p 3000:3000 fossy-api
```

## Usage

Post the URL of a file or a git repository to `/license/url`. Fossy-api then either fetches the file or clones the repository.

```sh
# single file
curl http://localhost:3000/license/url \
  -H 'Content-Type: text/plain' \
  --data https://raw.githubusercontent.com/codescoopltd/fossy-api/master/index.js
  
# repository
curl http://localhost:3000/license/url \
  -H 'Content-Type: text/plain' \
  --data https://github.com/codescoopltd/fossy-api
```

The result is returned as JSON.

## Credits

This code was created by Codescoop Ltd to integrate the Fossology scanners in to the Codescoop product and is published in the hope of being useful for others integrating Fossology.
