﻿if(window["C_$"]==null){C_$={};C_$.mtl=1000;C_$.setMaxTotalLines=function(lines){if(lines<=0){C_$.mtl=999999;}else{C_$.mtl=lines;}};C_$.bi=false;C_$.enableBuffering=function(enabled){C_$.bi=enabled;};C_$.mbl=20;C_$.setMaxBufferedLines=function(lines){if(lines<=0){C_$.mbl=20;}else{C_$.mbl=lines;}};C_$.mlc=40;C_$.setMaxLatency=function(latency){if(latency<=0){C_$.mlc=40;}else{C_$.mlc=latency;}};C_$.pi=false;C_$.enablePinning=function(enabled){C_$.pi=enabled;};C_$.lc=0;C_$.mbr=false;C_$.splitNeedFixed="\n".split(/\n/).length!=2;C_$.slr=function(s){var arr=new Array();var i=0;var last=-1;while(true){i=s.indexOf('\r',last+1);if(i!=-1){arr[arr.length]=s.substring(last+1,i);last=i;if(last+1==s.length){arr[arr.length]="";break;}}else{arr[arr.length]=s.substring(last+1);break;}}return arr;};C_$.sil=function(s){var arr=new Array();if(s==null){return arr;}var i=0;var last=-1;while(true){i=s.indexOf('\n',last+1);var str=null;if(i!=-1){if(i>0&&s.charAt(i-1)=='\r'){str=s.substring(last+1,i-1);}else{str=s.substring(last+1,i);}last=i;}else{str=s.substring(last+1);}var rArr=C_$.slr(str);for(var k=0;k<rArr.length;k++){arr[arr.length]=rArr[k];}if(i==-1){break;}else if(last+1==s.length){arr[arr.length]="";break;}}return arr;};C_$.cB=new Array();C_$.oT=new Date().getTime();C_$.lct=0;C_$.li=function(){if(C_$.cB.length==0){return;}var console=document.getElementById("_console_");;if(console==null){if(document.body==null){if(C_$.lct==0){C_$.lct=window.setTimeout("C_$.li ();",C_$.mlc);}return;}}C_$.cot();};C_$.createC_$Window=function(parentEl){var console=document.createElement("DIV");console.style.cssText="font-family:monospace, Arial, sans-serif;";document.body.appendChild(console);return console;};C_$.cot=function(s,color,bed){var console=document.getElementById("_console_");;if(console==null){if(document.body==null){C_$.cB[C_$.cB.length]={message:s,color:color};if(C_$.lct==0){C_$.lct=window.setTimeout("C_$.li ();",C_$.mlc);}return false;}else{console=C_$.createC_$Window();console.id="_console_";}}if(C_$.bi&&!bed&&C_$.cB.length<C_$.mbl&&new Date().getTime()-C_$.oT<C_$.mlc){C_$.cB[C_$.cB.length]={message:s,color:color};if(C_$.lct==0){C_$.lct=window.setTimeout("C_$.li ();",C_$.mlc);}return false;}if(C_$.bi&&bed&&C_$.lct!=0){window.clearTimeout(C_$.lct);C_$.lct=0;}if(!bed&&C_$.cB.length!=0){for(var i=0;i<C_$.cB.length;i++){var o=C_$.cB[i];C_$.cot(o.message,o.color,true);}C_$.cB=new Array();}if(C_$.lc>C_$.mtl){for(var i=0;i<C_$.lc-C_$.mtl;i++){if(console!=null&&console.childNodes.length>0){console.removeChild(console.childNodes[0]);}}C_$.lc=C_$.mtl;}var wbr=false;if(typeof s=="undefined"){s="";}else if(s==null){s="null";}else{s=""+s;}if(s.length>0){var lc=s.charAt(s.length-1);if(lc=='\n'){if(s.length>1){var preLastChar=s.charAt(s.length-2);if(preLastChar=='\r'){s=s.substring(0,s.length-2);}else{s=s.substring(0,s.length-1);}}else{s="";}wbr=true;}else if(lc=='\r'){s=s.substring(0,s.length-1);wbr=true;}}var lines=null;var c160=String.fromCharCode(160);s=s.replace(/\t/g,c160+c160+c160+c160+c160+c160+c160+c160);if(C_$.splitNeedFixed){try{lines=C_$.sil(s);}catch(e){window.popup(e.message);}}else{lines=s.split(/\r\n|\r|\n/g);}for(var i=0;i<lines.length;i++){var lE=null;if(C_$.mbr||C_$.lc==0||console.childNodes.length<1){lE=document.createElement("DIV");console.appendChild(lE);lE.style.whiteSpace="nowrap";C_$.lc++;}else{try{lE=console.childNodes[console.childNodes.length-1];}catch(e){lE=document.createElement("DIV");console.appendChild(lE);lE.style.whiteSpace="nowrap";C_$.lc++;}}var el=document.createElement("SPAN");lE.appendChild(el);el.style.whiteSpace="nowrap";if(color!=null){el.style.color=color;}if(lines[i].length==0){lines[i]=String.fromCharCode(160);}el.appendChild(document.createTextNode(lines[i]));if(!C_$.pi){console.scrollTop+=100;}if(i!=lines.length-1){C_$.mbr=true;}else{C_$.mbr=wbr;}}var cssClazzName=console.parentNode.className;if(!C_$.pi&&cssClazzName!=null&&cssClazzName.indexOf("composite")!=-1){console.parentNode.scrollTop=console.parentNode.scrollHeight;}C_$.oT=new Date().getTime();};C_$.clear=function(){C_$.mbr=true;var console=document.getElementById("_console_");;if(console==null){if(document.body==null){C_$.cB=[];}return;}C_$.cB=[];var childNodes=console.childNodes;for(var i=childNodes.length-1;i>=0;i--){console.removeChild(childNodes[i]);}C_$.lc=0;};window.popup=window.alert;window.alert=function(s){C_$.cot(s+"\r\n");};window.error=function(s){C_$.cot(s+"\r\n","red");};window.log=function(s){C_$.cot(s+"\r\n","blue");};window.assert=function(){var b=true;if(arguments.length==1){b=arguments[0];}else if(arguments.length==2){var x1=arguments[0];var x2=arguments[1];b=(x1==x2);}else{var x1=arguments[0];var x2=arguments[1];var delta=arguments[2];b=Math.abs(x1-x2)<Math.abs(delta);}if(b){C_$.cot("Passed\r\n","green");}else{if(arguments.length>=2){C_$.cot("Failed: expecting "+arguments[1]+", but "+arguments[0]+" !\r\n","red");}else{C_$.cot("Failed\r\n","red");}}};System=new Clazz._O();System.currentTimeMillis=function(){return new Date().getTime();};System.arraycopy=function(src,srcPos,dest,destPos,length){if(src!=dest){for(var i=0;i<length;i++){dest[destPos+i]=src[srcPos+i];}}else{var swap=[];for(var i=0;i<length;i++){swap[i]=src[srcPos+i];}for(var i=0;i<length;i++){dest[destPos+i]=swap[i];}}};System.identityHashCode=function(obj){if(obj==null){return 0;}try{return obj.toString().hashCode();}catch(e){var str=":";for(var s in obj){str+=s+":"}return str.hashCode();}};System.props=null;System.getProperties=function(){return System.props;};System.getProperty=function(key,def){if(System.props!=null){return System.props.getProperty(key,def);}if(def!=null){return def;}return key;};System.setProperties=function(props){System.props=props;};System.setProperty=function(key,val){if(System.props==null){return;}System.props.setProperty(key,val);};System.out=new Clazz._O();System.out.__CLASS_NAME__="java.io.PrintStream";System.out.print=function(s){C_$.cot(s);};System.out.println=function(s){if(typeof s=="undefined"){s="\r\n";}else if(s==null){s="null\r\n";}else{s=s+"\r\n";}C_$.cot(s);};System.err=new Clazz._O();System.err.__CLASS_NAME__="java.io.PrintStream";System.err.print=function(s){C_$.cot(s,"red");};System.err.println=function(s){if(typeof s=="undefined"){s="\r\n";}else if(s==null){s="null\r\n";}else{s=s+"\r\n";}C_$.cot(s,"red");};System.out.printf=System.err.printf=function(format,args){if(format==null||format.length==0){return;}var xargs=new Array();if(arguments.length!=2){for(var i=1;i<arguments.length;i++){xargs[i-1]=arguments[i];}}else if(arguments[1]instanceof Array){xargs=arguments[1];}else{xargs=[args];}var index=0;var str=format.replace(/%(\d+\$)?([-#+ 0,\(<]*)?(\d+)?(\.\d+)?([tT])?([a-zA-Z%])/g,function($0,$1,$2,$3,$4,$5,$6){var o=null;if($1!=null&&$1.length!=0){var i=parseInt($1)-1;o=xargs[i];}else if($2!=null&&$2.length!=0){o=xargs[index-1];}else if($5!=null&&$5.length!=0){o=this.formatTime(xargs[index],$6);index++;}else if($6=="n"){o="\r\n";}else if($6=="%"){o="%";}else{o=xargs[index];index++;}return o.toString();});this.print(str);};System.out.formatTime=System.err.formatTime=function(t,p){var o=t;if(p=="H"){o=""+t.getHours();if(o.lenght<2){o="0"+o;}}else if(p=="I"){o=""+(t.getHours()%12);if(o.lenght<2){o="0"+o;}}else if(p=="k"){o=""+t.getHours();}else if(p=="l"){o=""+(t.getHours()%12);}else if(p=="M"){o=""+t.getMinutes();if(o.lenght<2){o="0"+o;}}else if(p=="S"){o=""+t.getSeconds();if(o.lenght<2){o="0"+o;}}else if(p=="L"){o="000";}else if(p=="N"){o="000000000";}else if(p=="k"){o=(t.getHours()>12)?"pm":"am";}else if(p=="z"){o="+0800";}return o;};}Console=C_$;
