#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const storePath = path.join(__dirname, '..', '.local', 'session.json')

if (fs.existsSync(storePath)) {
  fs.unlinkSync(storePath)
  console.log('Store reset. Session state cleared - fixture data will be used on next load.')
} else {
  console.log('Nothing to reset - store file does not exist.')
}
