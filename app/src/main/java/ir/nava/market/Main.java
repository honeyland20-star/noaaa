package ir.nava.market;

import android.app.Activity;
import android.os.Bundle;
import android.security.keystore.*;
import android.util.Base64;
import android.view.WindowManager;
import android.webkit.*;
import org.json.*;
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters;
import org.bouncycastle.crypto.signers.Ed25519Signer;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.HttpsURLConnection;
import java.net.*;
import java.io.*;
import java.security.KeyStore;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.Date;
import org.w3c.dom.*;
import javax.xml.parsers.*;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;

public class Main extends Activity {
    WebView view;
    volatile boolean visible;
    final ExecutorService queue = Executors.newSingleThreadExecutor();
    static final String ROOT = "https://apiv2.nobitex.ir";
    public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        getWindow().setStatusBarColor(0xff101b2a);
        view = new WebView(this);
        view.getSettings().setJavaScriptEnabled(true);
        view.getSettings().setAllowContentAccess(false);
        view.getSettings().setAllowFileAccess(false);
        view.setWebViewClient(new WebViewClient(){
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r){return true;}
        });
        view.addJavascriptInterface(new Bridge(), "Phone");
        setContentView(view);
        view.loadUrl("file:///android_asset/index.html");
    }
    protected void onResume(){super.onResume(); visible=true;}
    protected void onPause(){visible=false; super.onPause();}
    protected void onDestroy(){queue.shutdown(); view.removeJavascriptInterface("Phone"); super.onDestroy();}

    synchronized SecretKey key() throws Exception {
        KeyStore ks=KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        if(ks.containsAlias("nava")) return (SecretKey)ks.getKey("nava",null);
        KeyGenerator gen=KeyGenerator.getInstance("AES","AndroidKeyStore");
        gen.init(new KeyGenParameterSpec.Builder("nava",3).setBlockModes("GCM").setEncryptionPaddings("NoPadding").build());
        return gen.generateKey();
    }
    static String enc(byte[] b){return Base64.encodeToString(b,Base64.NO_WRAP);}
    byte[] bytes(String s){return s.getBytes(StandardCharsets.UTF_8);}
    synchronized void save(String id,String value) throws Exception {
        Cipher c=Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE,key());
        c.updateAAD(bytes(id));
        String packed=enc(c.getIV())+"."+enc(c.doFinal(bytes(value)));
        if(!getPreferences(0).edit().putString(id,packed).commit())throw new IOException();
    }
    synchronized String load(String id) throws Exception {
        String packed=getPreferences(0).getString(id,null); if(packed==null)return "{}";
        String[] a=packed.split("[.]"); Cipher c=Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(a[0],0)));
        c.updateAAD(bytes(id));
        return new String(c.doFinal(Base64.decode(a[1],0)),StandardCharsets.UTF_8);
    }
    String request(String url,String body, JSONObject auth,String path) throws Exception {
        HttpsURLConnection h=(HttpsURLConnection)new URL(url).openConnection();
        try{
            h.setConnectTimeout(10000);h.setReadTimeout(14000);h.setInstanceFollowRedirects(false);
            h.setRequestProperty("User-Agent","NavaAndroid/0.1");
            String method=body==null?"GET":"POST";h.setRequestMethod(method);
            if(auth!=null){
                String time=String.valueOf(System.currentTimeMillis()/1000);
                byte[] secret=Base64.decode(auth.getString("priv"),Base64.URL_SAFE);
                if(secret.length!=32)throw new IOException("طول کلید خصوصی صحیح نیست");
                Ed25519Signer signer=new Ed25519Signer(); signer.init(true,new Ed25519PrivateKeyParameters(secret,0));
                byte[] data=bytes(time+method+path+(body==null?"":body));signer.update(data,0,data.length);
                h.setRequestProperty("Nobitex-Signature",Base64.encodeToString(signer.generateSignature(),Base64.NO_WRAP|Base64.URL_SAFE));
                h.setRequestProperty("Nobitex-Key",auth.getString("pub"));h.setRequestProperty("Nobitex-Timestamp",time);
            }
            if(body!=null){h.setDoOutput(true);h.setRequestProperty("Content-Type","application/json");try(OutputStream out=h.getOutputStream()){out.write(bytes(body));}}
            int status=h.getResponseCode();if(status!=200)throw new IOException("HTTP "+status);
            try(InputStream in=h.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                byte[] buf=new byte[8192];int n;
                while((n=in.read(buf))!=-1){if(out.size()+n>2000000)throw new IOException();out.write(buf,0,n);}
                return out.toString("UTF-8");
            }
        }finally{h.disconnect();}
    }
    JSONObject nob(String path,JSONObject body,JSONObject auth) throws Exception{
        JSONObject result=new JSONObject(request(ROOT+path,body==null?null:body.toString(),auth,path));
        if(!"ok".equals(result.optString("status")))throw new IOException("درخواست نوبیتکس تأیید نشد");
        return result;
    }
    JSONArray news(String symbol,String equities) throws Exception{
        String query=(symbol.equals("BTC")?"Bitcoin":symbol.equals("ETH")?"Ethereum":"Solana")+" OR cryptocurrency";
        if(!equities.trim().isEmpty())query+=" OR "+equities.trim();
        String url="https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q="+URLEncoder.encode("("+query+") when:1d","UTF-8");
        String xml=request(url,null,null,null);
        DocumentBuilderFactory factory=DocumentBuilderFactory.newInstance();
        if(xml.toUpperCase(java.util.Locale.ROOT).contains("<!DOCTYPE"))throw new IOException();
        factory.setExpandEntityReferences(false);
        NodeList items=factory.newDocumentBuilder().parse(new ByteArrayInputStream(bytes(xml))).getElementsByTagName("item");
        JSONArray list=new JSONArray();
        for(int i=0;i<Math.min(items.getLength(),35);i++){
            Element item=(Element)items.item(i);
            String title=tag(item,"title"),date=tag(item,"pubDate");
            try {long age=System.currentTimeMillis()-ZonedDateTime.parse(date,DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toEpochMilli();
            if(age>=0 && age<86400000)list.put(new JSONObject().put("title",title).put("source",tag(item,"source")).put("url",tag(item,"link")));}catch(java.time.DateTimeException ignored){}
        }
        return list;
    }
    String tag(Element e,String t){Node n=e.getElementsByTagName(t).item(0);return n==null?"":n.getTextContent();}
    class Bridge {
        @JavascriptInterface public String read(String id){try{return load(id);}catch(Exception e){return "null";}}
        @JavascriptInterface public boolean write(String id,String value){try{save(id,value);return true;}catch(Exception e){return false;}}
        @JavascriptInterface public boolean active(){return visible;}
        @JavascriptInterface public void call(int id,String op,String input){
            queue.submit(()->{JSONObject reply=new JSONObject();
                try{
                    JSONObject p=new JSONObject(input), cfg=new JSONObject(load("config")); Object result;
                    String sym=cfg.optString("symbol","BTC");
                    if(!sym.matches("BTC|ETH|SOL"))throw new IOException();
                    switch(op){
                    case "quote":result=nob("/v3/orderbook/"+sym+"USDT",null,null);break;
                    case "news": result=news(sym,cfg.optString("equities",""));break;
                    case "profile": nob("/users/profile",null,cfg);result=true;break;
                    case "send":
                        String token=cfg.optString("token");if(!token.matches("[0-9]+:[A-Za-z0-9_-]+")||!cfg.optString("chat").matches("[1-9][0-9]+"))throw new IOException("تنظیمات تلگرام ناقص است");
                        JSONObject msg=new JSONObject().put("chat_id",cfg.getString("chat")).put("text",p.getString("text"));
                        JSONObject sent=new JSONObject(request("https://api.telegram.org/bot"+token+"/sendMessage",msg.toString(),null,null));
                        if(!sent.optBoolean("ok"))throw new IOException();result=true;break;
                    case "order":
                        if(!visible)throw new IOException("برنامه در پیش‌زمینه نیست");
                        result=nob("/market/orders/add",p,cfg);break;
                    case "status": result=nob("/market/orders/status",p,cfg);break;
                    default:throw new IOException();}
                    reply.put("data",result);
                }catch(Exception e){try{String msg=e.getMessage();reply.put("error",msg!=null&&(msg.matches("HTTP [0-9]+")||msg.matches("[\\p{IsArabic}‌ ]+"))?msg:"ارتباط یا اعتبارسنجی پاسخ ناموفق بود");}catch(Exception ignored){}}
                String js="window.receive("+id+","+JSONObject.quote(reply.toString())+")";
                runOnUiThread(()->{if(!isDestroyed())view.evaluateJavascript(js,null);});
            });
        }
    }
}
