(function (global) {
  function getSpeechRecognitionCtor() {
    return global.SpeechRecognition || global.webkitSpeechRecognition || null;
  }

  function isSpeechRecognitionSupported() {
    return getSpeechRecognitionCtor() !== null;
  }

  function buildTranscript(results) {
    var finalText = "";
    var interimText = "";
    for (var i = 0; i < results.length; i++) {
      var chunk = results[i][0] ? results[i][0].transcript : "";
      if (results[i].isFinal) {
        finalText += chunk;
      } else {
        interimText += chunk;
      }
    }
    return { finalText: finalText, interimText: interimText };
  }

  function speechErrorMessage(error) {
    switch (error) {
      case "aborted":
        return null;
      case "not-allowed":
      case "service-not-allowed":
        return "麦克风权限被拒绝，请在浏览器地址栏允许麦克风访问后重试。";
      case "no-speech":
        return "未检测到语音，请靠近麦克风后再次点击「语音输入」。";
      case "audio-capture":
        return "无法访问麦克风，请检查设备是否被其他程序占用。";
      case "network":
        return "语音识别需要网络连接，请检查网络后重试。";
      default:
        return "语音识别失败（" + error + "），请重试或使用文字输入。";
    }
  }

  function ensureMicrophoneAccess() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.resolve(null);
    }
    return navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(function (stream) {
        stream.getTracks().forEach(function (track) {
          track.stop();
        });
        return null;
      })
      .catch(function () {
        return "无法访问麦克风，请在浏览器中允许麦克风权限。";
      });
  }

  function voiceStatusLabel(status) {
    switch (status) {
      case "starting":
        return "正在启动…";
      case "listening":
        return "停止录音";
      case "stopping":
        return "正在结束…";
      default:
        return "语音输入";
    }
  }

  function voiceStatusHint(status) {
    switch (status) {
      case "starting":
        return "正在连接麦克风，请稍候…";
      case "listening":
        return "正在聆听，说完后点击「停止录音」结束";
      case "stopping":
        return "正在结束录音…";
      default:
        return "";
    }
  }

  function SpeechInputController(options) {
    this.options = options;
    this.recognition = null;
    this.status = "idle";
    this.userStopped = false;
    this.baseText = "";
    this.lastComposedText = "";
  }

  SpeechInputController.prototype.getStatus = function () {
    return this.status;
  };

  SpeechInputController.prototype.isActive = function () {
    return this.status === "starting" || this.status === "listening";
  };

  SpeechInputController.prototype.setStatus = function (status) {
    this.status = status;
    this.options.onStatusChange(status);
  };

  SpeechInputController.prototype.composeText = function (finalText, interimText) {
    var spoken = (finalText + interimText).trim();
    if (!spoken) return this.baseText.trim();
    if (!this.baseText) return spoken;
    return (this.baseText.trim() + " " + spoken).trim();
  };

  SpeechInputController.prototype.attachHandlers = function (rec) {
    var self = this;
    rec.onstart = function () {
      self.setStatus("listening");
      self.options.onError(null);
    };
    rec.onresult = function (event) {
      var parts = buildTranscript(event.results);
      var text = self.composeText(parts.finalText, parts.interimText);
      self.lastComposedText = text;
      self.options.onTextChange(text);
    };
    rec.onerror = function (event) {
      var error = event.error || "unknown";
      var message = speechErrorMessage(error);
      if (message) self.options.onError(message);
      if (error !== "aborted") {
        self.userStopped = true;
      }
    };
    rec.onend = function () {
      if (!self.userStopped && self.recognition) {
        var spoken = self.lastComposedText.trim();
        self.baseText = spoken ? spoken + " " : "";
        try {
          self.recognition.start();
          return;
        } catch (e) {
          // Ignore restart races when the user stops manually.
        }
      }
      self.recognition = null;
      self.setStatus("idle");
    };
  };

  SpeechInputController.prototype.createRecognition = function () {
    var Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return null;
    var rec = new Ctor();
    rec.lang = "zh-CN";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    this.attachHandlers(rec);
    return rec;
  };

  SpeechInputController.prototype.start = function (currentText) {
    var self = this;
    if (this.isActive()) return Promise.resolve();

    if (!getSpeechRecognitionCtor()) {
      this.options.onError("当前浏览器不支持语音识别，请使用 Chrome/Edge 或改用文字输入。");
      return Promise.resolve();
    }

    this.userStopped = false;
    this.baseText = currentText.trim() ? currentText.trim() + " " : "";
    this.lastComposedText = currentText.trim();
    this.setStatus("starting");
    this.options.onError(null);

    return ensureMicrophoneAccess().then(function (micError) {
      if (micError) {
        self.setStatus("idle");
        self.options.onError(micError);
        return;
      }
      if (self.userStopped) {
        self.setStatus("idle");
        return;
      }
      var rec = self.createRecognition();
      if (!rec) {
        self.setStatus("idle");
        self.options.onError("当前浏览器不支持语音识别，请使用 Chrome/Edge 或改用文字输入。");
        return;
      }
      self.recognition = rec;
      try {
        rec.start();
      } catch (e) {
        self.recognition = null;
        self.setStatus("idle");
        self.options.onError("无法启动语音识别，请稍后重试。");
      }
    });
  };

  SpeechInputController.prototype.stop = function () {
    if (!this.isActive()) return;
    this.userStopped = true;
    this.setStatus("stopping");
    if (this.recognition) this.recognition.stop();
  };

  SpeechInputController.prototype.destroy = function () {
    this.userStopped = true;
    if (this.recognition) this.recognition.stop();
    this.recognition = null;
    this.setStatus("idle");
  };

  global.ReportSpeech = {
    SpeechInputController: SpeechInputController,
    isSpeechRecognitionSupported: isSpeechRecognitionSupported,
    voiceStatusLabel: voiceStatusLabel,
    voiceStatusHint: voiceStatusHint,
  };
})(window);
