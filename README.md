API Blueprint Validator
=======================

API Blueprint Validator is a simple for validating Apiary API blueprint format and JSON request and responses.

## Examples outputs 

**Invalid API Blueprint:**

Error: unexpected header block, expected a group, resource or an action definition, e.g. '# Group <name>', '# <resource name> [<URI>]' or '# <HTTP method> <URI>' on line 60

**Invalid JSON response:**

    Error in JSON response in group "Articles", resource "Articles", action "List articles"
        Parse error on line 32:
        ...                    "unverifiable":5   
        -----------------------^
        Expecting 'EOF', '}', ',', ']', got 'STRING'


## Usage

    $ ./api-blueprint-validator apiary.apib
    
Returns exit code `1` if errors was find in Blueprint or in JSON requests or responses, otherwise returns `0`, so you can use this tool with you CI server ([simple Travis integration example][travis]).

[travis]: https://github.com/Demagog2/api/blob/master/.travis.yml

## Installation
[Node.js][] and [NPM][] is required.

    $ npm install api-blueprint-validator
    
[Node.js]: https://npmjs.org/
[NPM]: https://npmjs.org/

## Command Line Options

    $ ./api-blueprint-validator --help
    Usage: node ./node_modules/.bin/api-blueprint-validator apiary.apib 
    
    Options:
      --validate-requests   [default: true]
      --validate-responses  [default: true]
