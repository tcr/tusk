// Generated by CoffeeScript 1.9.0
var LogParse = (function() {
  var LogParse, backgroundColors, foregroundColors;

  function LogParse(emit) {
    this.emit = emit;

    this.beginLine();
    this.state = 'text';
    this.chunk = '';
    this.control = '';
    this.foldDepth = 0;
    this.ansi = {
      foreground: null,
      background: null,
      bold: false,
      italic: false,
      underline: false
    };
    this.content = [];
  }

  LogParse.prototype.beginLine = function() {
    this.content = [''];
    this.appended = false;
  };

  LogParse.prototype.push = function(s) {
    if (!s) {
      this.endSpan();
      this.flushLine();
    }
    var c, code, _i, _j, _len, _len1, _ref;
    for (_i = 0, _len = s.length; _i < _len; _i++) {
      c = s[_i];
      switch (this.state) {
        case 'text':
          switch (c) {
            case '\x1b':
              this.state = 'ansiStart';
              break;
            case '\n':
              this.replaceLine = false;
              this.chunk += c;
              this.endSpan();
              this.endLine();
              break;
            case '\r':
              this.endSpan();
              this.replaceLine = true;
              break;
            case '\x02':
              this.foldDepth += 1;
              break;
            case '\x03':
              this.foldDepth -= 1;
              break;
            default:
              this.chunk += c;
          }
          break;
        case 'ansiStart':
          switch (c) {
            case '[':
              this.endSpan();
              this.control = '';
              this.state = 'ansi';
              break;
            default:
              this.state = 'text';
          }
          break;
        case 'ansi':
          switch (c) {
            case 'm':
              _ref = this.control.split(';');
              for (_j = 0, _len1 = _ref.length; _j < _len1; _j++) {
                code = _ref[_j];
                this.ansiStyle(code);
              }
              this.control = '';
              this.state = 'text';
              break;
            case '0':
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
            case '6':
            case '7':
            case '8':
            case '9':
            case ';':
              this.control += c;
              break;
            default:
              this.state = 'text';
          }
      }
    }
  };

  LogParse.prototype.ansiStyle = function(code) {
    if (foregroundColors[code]) {
      this.ansi.foreground = foregroundColors[code];
    } else if (backgroundColors[code]) {
      this.ansi.background = backgroundColors[code];
    } else if (code === '39') {
      this.ansi.foreground = null;
    } else if (code === '49') {
      this.ansi.background = null;
    } else if (code === '1') {
      this.ansi.bold = true;
    } else if (code === '22') {
      this.ansi.bold = false;
    } else if (code === '3') {
      this.ansi.italic = true;
    } else if (code === '23') {
      this.ansi.italic = false;
    } else if (code === '4') {
      this.ansi.underline = true;
    } else if (code === '24') {
      this.ansi.underline = false;
    } else if (code === '0') {
      this.ansi.bold = false;
      this.ansi.foreground = null;
    }
  };

  LogParse.prototype.endSpan = function() {
    var classes, node, text;
    if (!this.chunk.length) {
      return;
    }
    if (this.replaceLine) {
      this.content = [''];
      this.replaceLine = false;
    }
    classes = [];
    if (this.ansi.foreground) {
      classes.push(this.ansi.foreground);
    }
    if (this.ansi.background) {
      classes.push('bg-' + this.ansi.background);
    }
    if (this.ansi.bold) {
      classes.push('bold');
    }
    if (this.ansi.italic) {
      classes.push('italic');
    }

    if (classes.length) {
      var className = classes.join(' ');
      this.content.push('<span class="' + className + '">');
      this.content.push(this.chunk);
      this.content.push('</span>');
    } else {
      this.content.push(this.chunk);
    }
    this.chunk = '';
  };

  LogParse.prototype.endLine = function() {
    this.content.push('');
    this.flushLine();
    this.beginLine();
  };

  LogParse.prototype.flushLine = function() {
    if (!this.appended) {
      this.emit(this.content.join(''));
      this.appended = true;
    }
  };

  foregroundColors = {
    '30': 'black',
    '31': 'red',
    '32': 'green',
    '33': 'yellow',
    '34': 'blue',
    '35': 'magenta',
    '36': 'cyan',
    '37': 'white',
    '90': 'grey'
  };

  backgroundColors = {
    '40': 'black',
    '41': 'red',
    '42': 'green',
    '43': 'yellow',
    '44': 'blue',
    '45': 'magenta',
    '46': 'cyan',
    '47': 'white'
  };

  return LogParse;

}).call(this);

module.exports = LogParse;