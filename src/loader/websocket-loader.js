/*
 * Websocket Loader
*/

import Event from '../events';
import EventHandler from '../event-handler';
import SlicesReader from '../utils/h264-nal-slicesreader.js';

class WebsocketLoader extends EventHandler {

  constructor(wfs) {
    super(wfs, 
      Event.WEBSOCKET_ATTACHING,
      Event.WEBSOCKET_DATA_UPLOADING,
      Event.WEBSOCKET_MESSAGE_SENDING,
      Event.WEBSOCKET_RECONNECTION
    )   
    this.buf = null;
    this.slicesReader = new SlicesReader(wfs);
    this.mediaType = undefined; 
    this.channelName = undefined; 
    this.firstTimeStamp = null;
    this.firstLocalTimeStamp = null;
    // 重连标志
    this.reconnectionFlag = false;
  }
 
  destroy() { 
	  !!this.client && this.client.close();
    // console.log("这里没有断开链接吗？")
    this.firstTimeStamp = null;
    this.firstLocalTimeStamp = null;
    this.buf = null;
	  this.slicesReader.destroy();
    EventHandler.prototype.destroy.call(this);
  }

  onWebsocketAttaching(data) {
  	this.mediaType = data.mediaType; 
  	this.channelName = data.channelName;  
    if( data.websocket instanceof WebSocket ) {
      this.client = data.websocket;
      this.client.onopen = this.initSocketClient.bind(this);   
      this.client.onclose = (e) => {
        this.firstTimeStamp = null;
        this.firstLocalTimeStamp = null;
        this.reconnectionFlag = false;
        console.log('Websocket Disconnected!');
      }; 
    }    
  }

  initSocketClient(client){
    this.client.binaryType = 'arraybuffer';
    this.client.onmessage = this.receiveSocketMessage.bind(this);
    this.wfs.trigger(Event.WEBSOCKET_MESSAGE_SENDING, {commandType: "open", channelName:this.channelName, commandValue:"NA" });
    console.log('Websocket Open!'); 
  }
 
  /**
   * 解析时间戳函数
   * 截取每个数据报的前13个字节   前8个字节是存放的时间戳数据 前4个秒数 后4个毫秒数
   * 判断第9 - 12满足条件 0 0 0 1
   */
  paringTimeStamp(subUint8Array) {

    // 如果进入重连状态,就不需要再解析数据了,不然会触发创建多个webscoket链接
    if(this.reconnectionFlag) {
      return;
    }

    // 是否满足解析标志位
    if(subUint8Array[8] == 0 && subUint8Array[9] == 0 && subUint8Array[10] == 0 && subUint8Array[11] == 1) {
      // 解析时间戳
      var times = subUint8Array.subarray(0, 8)
      var view = new DataView(times.buffer, 0, 4);
      var currentTime = view.getUint32(0, 32);
      var currentlocalTime = parseInt(new Date().getTime()/1000);

      // console.log("打印一下解析到的时间戳：" + this.firstTimeStamp + " | " + currentTime)
      // console.log("打印一下当前的时间戳：" + this.firstLocalTimeStamp + " | " + currentlocalTime)
      if(!this.firstTimeStamp) {
        this.firstTimeStamp = currentTime;
        this.firstLocalTimeStamp = currentlocalTime
      }else{
        var diffPlayTime = currentTime - this.firstTimeStamp
        var diffLocal = currentlocalTime - this.firstLocalTimeStamp
        //console.log("时间的差值：", Math.abs(diffLocal - diffPlayTime) )
        if(Math.abs(diffLocal - diffPlayTime) >= 2) {
          console.log("需要触发重新拉取图像了记录时间：" + currentlocalTime + this.wfs.copterId)
          //console.log("时间的差值：", Math.abs(diffLocal - diffPlayTime) )
          // 断开websocket链接
          // 暂时不重连
          this.reconnectionFlag = true
          this.client.close();
          this.wfs.trigger(Event.WEBSOCKET_RECONNECTION)
        }
      }
    } 
  }

  receiveSocketMessage( event ){
    if(document['hidden']) return;
    this.buf = new Uint8Array(event.data);
    var copy = new Uint8Array(this.buf); 
    // 在这里接触时间戳出来
    let subArray = this.buf.subarray(0, 13)
    this.paringTimeStamp(subArray);

    if (this.mediaType ==='FMp4'){
      this.wfs.trigger(Event.WEBSOCKET_ATTACHED, {payload: copy });
    } 
    if (this.mediaType === 'H264Raw'){
      this.wfs.trigger(Event.H264_DATA_PARSING, {data: copy });
    }
    // this.reconnectionFlag = false   
  }

  onWebsocketDataUploading( event ){
    this.client.send( event.data );
  }
  
  onWebsocketMessageSending( event ){  
    this.client.send( JSON.stringify({ t: event.commandType, c:event.channelName, v: event.commandValue  }) );
  }

  // 重新建立链接
  onWebsocketReconnection() {
    this.firstTimeStamp = null;
    this.firstLocalTimeStamp = null;
    this.wfs.trigger(Event.MEDIA_ATTACHED, {websocketUrl:this.wfs.websocketUrl, copterId: this.wfs.copterId, media:this.wfs.media, channelName:this.wfs.copterId, mediaType: this.wfs.mediaType, websocketName:this.wfs.websocketName}); 
  }
}

export default WebsocketLoader;  
