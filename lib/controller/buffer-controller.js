'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _events = require('../events');

var _events2 = _interopRequireDefault(_events);

var _eventHandler = require('../event-handler');

var _eventHandler2 = _interopRequireDefault(_eventHandler);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; } /*
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                * Buffer Controller
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               */

var BufferController = function (_EventHandler) {
  _inherits(BufferController, _EventHandler);

  function BufferController(wfs) {
    _classCallCheck(this, BufferController);

    var _this2 = _possibleConstructorReturn(this, (BufferController.__proto__ || Object.getPrototypeOf(BufferController)).call(this, wfs, _events2.default.MEDIA_ATTACHING, _events2.default.BUFFER_APPENDING, _events2.default.BUFFER_RESET));

    _this2.mediaSource = null;
    _this2.media = null;
    _this2.pendingTracks = {};
    _this2.sourceBuffer = {};
    _this2.segments = [];

    _this2.appended = 0;
    _this2._msDuration = null;

    // Source Buffer listeners
    _this2.onsbue = _this2.onSBUpdateEnd.bind(_this2);

    _this2.browserType = 0;
    if (navigator.userAgent.toLowerCase().indexOf('firefox') !== -1) {
      _this2.browserType = 1;
    }
    _this2.mediaType = 'H264Raw';

    _this2.websocketName = undefined;
    _this2.channelName = undefined;
    return _this2;
  }

  _createClass(BufferController, [{
    key: 'destroy',
    value: function destroy() {
      this.media = null;
      this.mediaSource = null;
      _eventHandler2.default.prototype.destroy.call(this);
    }
  }, {
    key: 'onMediaAttaching',
    value: function onMediaAttaching(data) {
      var media = this.media = data.media;
      this.mediaType = data.mediaType;
      this.websocketName = data.websocketName;
      this.channelName = data.channelName;
      var _this = this;
      var wfs = this.wfs;
      if (media) {
        // setup the media source
        var ms = this.mediaSource = new MediaSource();
        //Media Source listeners
        this.onmso = this.onMediaSourceOpen.bind(this);
        this.onmse = this.onMediaSourceEnded.bind(this);
        this.onmsc = this.onMediaSourceClose.bind(this);

        this.onVideoError = this.onVideoError.bind(this);

        ms.addEventListener('sourceopen', this.onmso);
        ms.addEventListener('sourceended', this.onmse);
        ms.addEventListener('sourceclose', this.onmsc);
        // link video and media Source
        media.src = URL.createObjectURL(ms);

        // media.addEventListener('error', function(err) {
        //   console.log("监听到了video错误,", media.error.code)
        //   // 直接调用绑定的videoError
        //   _this.wfs.config.videoError(err)
        // })
        media.addEventListener('error', this.onVideoError);
      }
    }
  }, {
    key: 'onVideoError',
    value: function onVideoError(err) {
      console.log("监听到了video错误,", this.media.error.code);
      this.media.removeEventListener('error', this.onVideoError);
      this.wfs.config.videoError(err);
    }
  }, {
    key: 'onMediaDetaching',
    value: function onMediaDetaching() {}

    // 当有缓冲数据加载后

  }, {
    key: 'onBufferAppending',
    value: function onBufferAppending(data) {
      if (!this.segments) {
        this.segments = [data];
      } else {
        this.segments.push(data);
      }
      // 暂时注销下
      this.doAppending();
    }
  }, {
    key: 'onMediaSourceClose',
    value: function onMediaSourceClose() {
      console.log('media source closed');
    }
  }, {
    key: 'onMediaSourceEnded',
    value: function onMediaSourceEnded() {
      console.log('media source ended');
    }
  }, {
    key: 'onSBUpdateEnd',
    value: function onSBUpdateEnd(event) {
      // Firefox
      if (this.browserType === 1) {
        this.mediaSource.endOfStream();
        this.media.play();
      }

      //console.log("medisSource UpDataEnd----2")
      this.appending = false;
      this.doAppending();
      // this.updateMediaElementDuration();
    }
  }, {
    key: 'updateMediaElementDuration',
    value: function updateMediaElementDuration() {}
  }, {
    key: 'onMediaSourceOpen',
    value: function onMediaSourceOpen() {
      var mediaSource = this.mediaSource;
      if (mediaSource) {
        // once received, don't listen anymore to sourceopen event
        mediaSource.removeEventListener('sourceopen', this.onmso);
      }

      if (this.mediaType === 'FMp4') {
        this.checkPendingTracks();
      }
      // 这里是去创建websocket链接
      this.wfs.trigger(_events2.default.MEDIA_ATTACHED, { websocketUrl: this.wfs.websocketUrl, copterId: this.wfs.copterId, media: this.media, channelName: this.channelName, mediaType: this.mediaType, websocketName: this.websocketName });
    }
  }, {
    key: 'checkPendingTracks',
    value: function checkPendingTracks() {
      this.createSourceBuffers({ tracks: 'video', mimeType: '' });
      this.pendingTracks = {};
    }
  }, {
    key: 'onBufferReset',
    value: function onBufferReset(data) {
      if (this.mediaType === 'H264Raw') {
        this.createSourceBuffers({ tracks: 'video', mimeType: data.mimeType });
      }
    }

    // 这个函数只运行一次

  }, {
    key: 'createSourceBuffers',
    value: function createSourceBuffers(tracks) {
      var sourceBuffer = this.sourceBuffer;
      var mediaSource = this.mediaSource;
      var mimeType = void 0;
      if (tracks.mimeType === '') {
        mimeType = 'video/mp4;codecs=avc1.420028'; // avc1.42c01f avc1.42801e avc1.640028 avc1.420028
      } else {
        mimeType = 'video/mp4;codecs=' + tracks.mimeType;
      }

      try {
        var sb = sourceBuffer['video'] = mediaSource.addSourceBuffer(mimeType);
        sb.addEventListener('updateend', this.onsbue);

        //console.log('看看mimieType',tracks.mimeType)
        //console.log("updateend------这里到了")
        tracks.buffer = sb;
      } catch (err) {
        console.log("这里是看mediaSource", err);
      }

      // 触发创建MediaSource的缓冲流
      this.wfs.trigger(_events2.default.BUFFER_CREATED, { tracks: tracks });

      this.media.play();
      // setTimeout(()=>{
      //   this.media.play()
      // })  
    }
  }, {
    key: 'createSourceBuffersTwo',
    value: function createSourceBuffersTwo(tracks) {

      var mimeType = void 0;
      if (tracks.mimeType === '') {
        mimeType = 'video/mp4;codecs=avc1.420028'; // avc1.42c01f avc1.42801e avc1.640028 avc1.420028
      } else {
        mimeType = 'video/mp4;codecs=' + tracks.mimeType;
      }

      try {
        this.sourceBuffer['video'] = this.mediaSource.addSourceBuffer(mimeType);
        this.sourceBuffer['video'].addEventListener('updateend', this.onsbue);
        //console.log("updateend------这里到了")
        tracks.buffer = this.sourceBuffer['video'];
      } catch (err) {
        console.log("这里是看mediaSource", err);
      }

      // 触发创建MediaSource的缓冲流
      this.wfs.trigger(_events2.default.BUFFER_CREATED, { tracks: tracks });

      this.media.play();
      // setTimeout(()=>{
      //   this.media.play()
      // })  
    }
  }, {
    key: 'doAppending',
    value: function doAppending() {

      //console.log("反正这里是都要来的吧")

      var wfs = this.wfs;
      var sourceBuffer = this.sourceBuffer;
      var segments = this.segments;

      // 先检查缓冲区
      if (Object.keys(sourceBuffer).length) {

        // 查看缓冲状态
        //console.log(sourceBuffer)
        //console.log('缓冲区的状态 -----',this.mediaSource.readyState)

        if (this.media.error) {
          this.segments = [];
          // 如果这里报错了,说明上一次收到数据解析的时候出了问题
          console.log('trying to append although a media error occured, flush segment and abort');
          return;
        }

        if (this.appending) {
          return;
        }

        if (segments && segments.length) {
          // 从数组的头部取出一个片段数据
          var segment = segments.shift();
          try {
            if (sourceBuffer[segment.type]) {
              this.parent = segment.parent;

              // 这里才是关键点,给mediaSouce 喂缓冲数据
              sourceBuffer[segment.type].appendBuffer(segment.data);
              this.appendError = 0;
              this.appended++;
              this.appending = true;
            } else {
              //console.log('--------------------------------------------')
            }
          } catch (err) {
            //console.log("doAppending------------------", err.code)
            // in case any error occured while appending, put back segment in segments table 
            // 如果处理有错误,把取出的数据再压回头部
            segments.unshift(segment);
            var event = { type: ErrorTypes.MEDIA_ERROR };
            if (err.code !== 22) {
              if (this.appendError) {
                this.appendError++;
              } else {
                this.appendError = 1;
              }
              event.details = ErrorDetails.BUFFER_APPEND_ERROR;
              event.frag = this.fragCurrent;
              if (this.appendError > wfs.config.appendErrorMaxRetry) {
                segments = [];
                event.fatal = true;
                return;
              } else {
                event.fatal = false;
              }
            } else {
              this.segments = [];
              event.details = ErrorDetails.BUFFER_FULL_ERROR;
              return;
            }
          }
        }
      }
    }
  }]);

  return BufferController;
}(_eventHandler2.default);

exports.default = BufferController;