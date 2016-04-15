var fs = require('fs'),
    glob = require('glob-fs')({ gitignore: true }),
    isGlob = require('is-glob'),
    protagonist = require('protagonist'),
    jsonParser = require('jsonlint').parser;

function lineNumberFromCharacterIndex(string, index) {
  return string.substring(0, index).split("\n").length;
}

function examples(ast, callback) {
  ast.resourceGroups.forEach(function (resourceGroup) {
    resourceGroup.resources.forEach(function (resource) {
      resource.actions.forEach(function (action) {
        action.examples.forEach(function (example) {
          callback(example, action, resource, resourceGroup);
        });
      });
    });
  });
}

function isJsonContentType(headers) {
  return headers.some(function (header) {
    return header.name === 'Content-Type' && header.value === 'application/json';
  });
}

function isValidRequestOrResponse(requestOrResponse) {
  if (isJsonContentType(requestOrResponse.headers)) {
    try {
      var body = requestOrResponse.body;
      jsonParser.parse(body);
    } catch (e) {
      return e;
    }
  }

  return true;
}

function errorPosition(example, action, resource, resourceGroup) {
  var output = [];
  if (resourceGroup.name) {
    output.push('group "' + resourceGroup.name + '"');
  }
  if (resource.name) {
    output.push('resource "' + resourceGroup.name + '"');
  } else {
    output.push('resouce "' + resource.uriTemplate + '"');
  }
  if (action.name) {
    output.push('action "' + action.name + '"');
  }
  if (example.name) {
    output.push('example "' + example.name + '"');
  }

  return 'in ' + output.join(', ');
}

function lint(file, data, options) {
  function shouldSkip(event) {
    return (!options.requireBlueprintName && event.message.indexOf('expected API name') !== -1 );
  }

  var parserOptions = {
    requireBlueprintName: options.requireBlueprintName,
    type: 'ast'
  };

  protagonist.parse(data, parserOptions, function (error, result) {
    if (error) {
      var lineNumber = lineNumberFromCharacterIndex(data, error.location[0].index);
      console.error('(' + file + ')' + ' ' + 'Error: ' + error.message + ' on line ' + lineNumber);
      process.exit(1);
    }

    result.warnings.forEach(function (warning) {
      if (!shouldSkip(warning)) {
        var lineNumber = lineNumberFromCharacterIndex(data, warning.location[0].index);
        console.error('(' + file + ')' + ' ' + 'Warning: ' + warning.message + ' on line ' + lineNumber);
      }
    });

    var errors = [];

    examples(result.ast, function (example, action, resource, resourceGroup) {
      if (options.validateRequests) {
        example.requests.forEach(function (request) {
          var valid = isValidRequestOrResponse(request);
          if (valid !== true) {
            var message = '    ' + valid.message.replace(/\n/g, '\n    ');
            var position = errorPosition(example, action, resource, resourceGroup);
            errors.push('Error in JSON request ' + position + '\n' + message);
          }
        });
      }

      if (options.validateResponses) {
        example.responses.forEach(function (response) {
          var valid = isValidRequestOrResponse(response);
          if (valid !== true) {
            var message = '    ' + valid.message.replace(/\n/g, '\n    ');
            var position = errorPosition(example, action, resource, resourceGroup);
            errors.push('Error in JSON response ' + position + '\n' + message);
          }
        });
      }
    });

    if (errors.length > 0) {
      console.error(errors.join('\n\n'));
      process.exit(1);
    }
  });
}

function processFile(path, options) {
  fs.readFile(path, 'utf8', function (error, data) {
    if (error) {
      console.error('Could not open ' + path);
    }
    else {
      lint(path, data, options);
    }
  });
}

function processGlob(path, options) {
    glob.readdir(path, function (error, files) {
      if (error) {
        console.error('Unable to read files ' + path);
        return;
      }
      files.forEach(function (path) {
        processFile(path, options);
      });
    });
}

module.exports = function (fileName, validateRequests, validateResponses, requireBlueprintName) {
  var options = {
    validateRequests: validateRequests,
    validateResponses: validateResponses,
    requireBlueprintName: requireBlueprintName
  };

  if (isGlob(fileName)) {
    // never require the blueprint name for multiple files
    options.requireBlueprintName = false;
    processGlob(fileName, options);
  }
  else {
    processFile(fileName, options);
  }
};
