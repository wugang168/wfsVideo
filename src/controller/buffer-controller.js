/*
 * Buffer Controller
*/

import Event from '../events';
import EventHandler from '../event-handler';
 
class BufferController extends EventHandler {

  constructor(wfs) {
    super(wfs,
      Event.MEDIA_ATTACHING,
      Event.BUFFER_APPENDING,
      Event.BUFFER_RESET
    );
    
    this.mediaSource = null;
    this.media = null;
    this.pendingTracks = {};
    this.sourceBuffer = {};
    this.segments = [];
 
    this.appended = 0;
    this._msDuration = null;

    // Source Buffer listeners
    this.onsbue = this.onSBUpdateEnd.bind(this);

    this.browserType = 0;
    if (navigator.userAgent.toLowerCase().indexOf('firefox') !== -1){
      this.browserType = 1;
    }
    this.mediaType = 'H264Raw';

    this.websocketName = undefined; 
    this.channelName = undefined;
  }

  destroy() {
    this.media = null
    this.mediaSource = null
    EventHandler.prototype.destroy.call(this);
  }
 
  onMediaAttaching(data) {
    let media = this.media = data.media;
    this.mediaType = data.mediaType;
    this.websocketName = data.websocketName;
    this.channelName = data.channelName;

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

      media.addEventListener('error', this.onVideoError)
    }
  }

  onVideoError(err) {
    console.log("监听到了video错误,", this.media.error.code)
    this.media.removeEventListener('error', this.onVideoError)
    this.wfs.config.videoError(err)
  }

  onMediaDetaching() {}
   
  // 当有缓冲数据加载后
  onBufferAppending(data) { 
    if (!this.segments) {
      this.segments = [ data ];
    } else {
      this.segments.push(data); 
    }
    // 暂时注销下
    this.doAppending(); 
  }
  
  onMediaSourceClose() {
    console.log('media source closed');
  }

  onMediaSourceEnded() {
    console.log('media source ended');
  }

  onSBUpdateEnd(event) { 
    // Firefox
    if (this.browserType === 1){
      this.mediaSource.endOfStream();
      this.media.play();  
    }
    
    //console.log("medisSource UpDataEnd----2")
    this.appending = false;
    this.doAppending();
    // this.updateMediaElementDuration();
  }
 
  updateMediaElementDuration() {}

  onMediaSourceOpen() { 
    let mediaSource = this.mediaSource;
    if (mediaSource) {
      // once received, don't listen anymore to sourceopen event
      mediaSource.removeEventListener('sourceopen', this.onmso);
    }

    if (this.mediaType === 'FMp4'){ 
      this.checkPendingTracks();
    }
    // 这里是去创建websocket链接
    this.wfs.trigger(Event.MEDIA_ATTACHED, {websocketUrl:this.wfs.websocketUrl, copterId: this.wfs.copterId, media:this.media, channelName:this.channelName, mediaType: this.mediaType, websocketName:this.websocketName});
  }

  checkPendingTracks() {  
    this.createSourceBuffers({ tracks : 'video' , mimeType:'' } );
    this.pendingTracks = {};  
  }

  onBufferReset(data) { 
    if (this.mediaType === 'H264Raw'){ 
      this.createSourceBuffers({ tracks : 'video' , mimeType: data.mimeType } );
    }
  }
 
  // 这个函数只运行一次
  createSourceBuffers(tracks) {
    var sourceBuffer = this.sourceBuffer;
    var mediaSource = this.mediaSource;
    let mimeType;
    if (tracks.mimeType === ''){
      mimeType = 'video/mp4;codecs=avc1.420028'; // avc1.42c01f avc1.42801e avc1.640028 avc1.420028
    }else{
      mimeType = 'video/mp4;codecs=' + tracks.mimeType;
    }
 
    try {
      let sb = sourceBuffer['video'] = mediaSource.addSourceBuffer(mimeType);
      sb.addEventListener('updateend', this.onsbue);

      //console.log('看看mimieType',tracks.mimeType)
      //console.log("updateend------这里到了")
      tracks.buffer = sb;
    } catch(err) {
      console.log("这里是看mediaSource", err)
    }

    // 触发创建MediaSource的缓冲流
    this.wfs.trigger(Event.BUFFER_CREATED, { tracks : tracks } );

    this.media.play()
    // setTimeout(()=>{
    //   this.media.play()
    // })  
  }

  createSourceBuffersTwo(tracks) {

    let mimeType;
    if (tracks.mimeType === ''){
      mimeType = 'video/mp4;codecs=avc1.420028'; // avc1.42c01f avc1.42801e avc1.640028 avc1.420028
    }else{
      mimeType = 'video/mp4;codecs=' + tracks.mimeType;
    }
 
    try {
      this.sourceBuffer['video'] = this.mediaSource.addSourceBuffer(mimeType);
      this.sourceBuffer['video'].addEventListener('updateend', this.onsbue);
      //console.log("updateend------这里到了")
      tracks.buffer = this.sourceBuffer['video'];
    } catch(err) {
      console.log("这里是看mediaSource", err)
    }

    // 触发创建MediaSource的缓冲流
    this.wfs.trigger(Event.BUFFER_CREATED, { tracks : tracks } );

    this.media.play()
    // setTimeout(()=>{
    //   this.media.play()
    // })  
  }

  doAppending() {

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
          if(sourceBuffer[segment.type]) { 
            this.parent = segment.parent;

            // 这里才是关键点,给mediaSouce 喂缓冲数据
            sourceBuffer[segment.type].appendBuffer(segment.data);
            this.appendError = 0;
            this.appended++;
            this.appending = true;
          } else {
            //console.log('--------------------------------------------')
          }
        } catch(err) {
          //console.log("doAppending------------------", err.code)
          // in case any error occured while appending, put back segment in segments table 
          // 如果处理有错误,把取出的数据再压回头部
          segments.unshift(segment);
          var event = {type: ErrorTypes.MEDIA_ERROR};
          if(err.code !== 22) {
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
 
}

export default BufferController;
