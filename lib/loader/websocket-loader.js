'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _events = require('../events');

var _events2 = _interopRequireDefault(_events);

var _eventHandler = require('../event-handler');

var _eventHandler2 = _interopRequireDefault(_eventHandler);

var _h264NalSlicesreader = require('../utils/h264-nal-slicesreader.js');

var _h264NalSlicesreader2 = _interopRequireDefault(_h264NalSlicesreader);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; } /*
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                * Websocket Loader
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               */

var WebsocketLoader = function (_EventHandler) {
  _inherits(WebsocketLoader, _EventHandler);

  function WebsocketLoader(wfs) {
    _classCallCheck(this, WebsocketLoader);

    var _this = _possibleConstructorReturn(this, (WebsocketLoader.__proto__ || Object.getPrototypeOf(WebsocketLoader)).call(this, wfs, _events2.default.WEBSOCKET_ATTACHING, _events2.default.WEBSOCKET_DATA_UPLOADING, _events2.default.WEBSOCKET_MESSAGE_SENDING, _events2.default.WEBSOCKET_RECONNECTION));

    _this.buf = null;
    _this.slicesReader = new _h264NalSlicesreader2.default(wfs);
    _this.mediaType = undefined;
    _this.channelName = undefined;
    _this.firstTimeStamp = null;
    _this.firstLocalTimeStamp = null;
    // 重连标志
    _this.reconnectionFlag = false;
    return _this;
  }

  _createClass(WebsocketLoader, [{
    key: 'destroy',
    value: function destroy() {
      !!this.client && this.client.close();
      // console.log("这里没有断开链接吗？")
      this.firstTimeStamp = null;
      this.firstLocalTimeStamp = null;
      this.buf = null;
      this.slicesReader.destroy();
      _eventHandler2.default.prototype.destroy.call(this);
    }
  }, {
    key: 'onWebsocketAttaching',
    value: function onWebsocketAttaching(data) {
      var _this2 = this;

      this.mediaType = data.mediaType;
      this.channelName = data.channelName;
      if (data.websocket instanceof WebSocket) {
        this.client = data.websocket;
        this.client.onopen = this.initSocketClient.bind(this);
        this.client.onclose = function (e) {
          _this2.firstTimeStamp = null;
          _this2.firstLocalTimeStamp = null;
          _this2.reconnectionFlag = false;
          console.log('Websocket Disconnected!');
        };
      }
    }
  }, {
    key: 'initSocketClient',
    value: function initSocketClient(client) {
      this.client.binaryType = 'arraybuffer';
      this.client.onmessage = this.receiveSocketMessage.bind(this);
      this.wfs.trigger(_events2.default.WEBSOCKET_MESSAGE_SENDING, { commandType: "open", channelName: this.channelName, commandValue: "NA" });
      console.log('Websocket Open!');
    }

    // 解析时间戳函数

  }, {
    key: 'paringTimeStamp',
    value: function paringTimeStamp(subUint8Array) {

      // 如果进入重连状态,就不需要再解析数据了,不然会触发创建多个webscoket链接
      if (this.reconnectionFlag) {
        return;
      }

      // 是否满足解析标志位
      if (subUint8Array[8] == 0 && subUint8Array[9] == 0 && subUint8Array[10] == 0 && subUint8Array[11] == 1) {
        // 解析时间戳
        var times = subUint8Array.subarray(0, 8);
        var view = new DataView(times.buffer, 0, 4);
        var currentTime = view.getUint32(0, 32);
        var currentlocalTime = parseInt(new Date().getTime() / 1000);

        // console.log("打印一下解析到的时间戳：" + this.firstTimeStamp + " | " + currentTime)
        // console.log("打印一下当前的时间戳：" + this.firstLocalTimeStamp + " | " + currentlocalTime)
        if (!this.firstTimeStamp) {
          this.firstTimeStamp = currentTime;
          this.firstLocalTimeStamp = currentlocalTime;
        } else {
          var diffPlayTime = currentTime - this.firstTimeStamp;
          var diffLocal = currentlocalTime - this.firstLocalTimeStamp;
          //console.log("时间的差值：", Math.abs(diffLocal - diffPlayTime) )
          if (Math.abs(diffLocal - diffPlayTime) >= 2) {
            console.log("需要触发重新拉取图像了记录时间：" + currentlocalTime + this.wfs.copterId);
            //console.log("时间的差值：", Math.abs(diffLocal - diffPlayTime) )
            // 断开websocket链接
            // 暂时不重连
            this.reconnectionFlag = true;
            this.client.close();
            this.wfs.trigger(_events2.default.WEBSOCKET_RECONNECTION);
          }
        }
      }
    }
  }, {
    key: 'receiveSocketMessage',
    value: function receiveSocketMessage(event) {
      if (document['hidden']) return;
      this.buf = new Uint8Array(event.data);
      var copy = new Uint8Array(this.buf);
      // 在这里接触时间戳出来
      var subArray = this.buf.subarray(0, 13);
      this.paringTimeStamp(subArray);

      if (this.mediaType === 'FMp4') {
        this.wfs.trigger(_events2.default.WEBSOCKET_ATTACHED, { payload: copy });
      }
      if (this.mediaType === 'H264Raw') {
        this.wfs.trigger(_events2.default.H264_DATA_PARSING, { data: copy });
      }
      // this.reconnectionFlag = false   
    }
  }, {
    key: 'onWebsocketDataUploading',
    value: function onWebsocketDataUploading(event) {
      this.client.send(event.data);
    }
  }, {
    key: 'onWebsocketMessageSending',
    value: function onWebsocketMessageSending(event) {
      this.client.send(JSON.stringify({ t: event.commandType, c: event.channelName, v: event.commandValue }));
    }

    // 重新建立链接

  }, {
    key: 'onWebsocketReconnection',
    value: function onWebsocketReconnection() {
      this.firstTimeStamp = null;
      this.firstLocalTimeStamp = null;
      this.wfs.trigger(_events2.default.MEDIA_ATTACHED, { websocketUrl: this.wfs.websocketUrl, copterId: this.wfs.copterId, media: this.wfs.media, channelName: this.wfs.copterId, mediaType: this.wfs.mediaType, websocketName: this.wfs.websocketName });
    }
  }]);

  return WebsocketLoader;
}(_eventHandler2.default);

exports.default = WebsocketLoader;