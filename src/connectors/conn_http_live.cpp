/// \file conn_http_dynamic.cpp
/// Contains the main code for the HTTP Dynamic Connector

#include <iostream>
#include <iomanip>
#include <sstream>
#include <queue>
#include <cstdlib>
#include <cstdio>
#include <cmath>
#include <unistd.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <getopt.h>
#include <mist/socket.h>
#include <mist/http_parser.h>
#include <mist/json.h>
#include <mist/dtsc.h>
#include <mist/mp4.h>
#include <mist/config.h>
#include <sstream>
#include <mist/stream.h>
#include <mist/timing.h>
#include <mist/ts_packet.h>

/// Holds everything unique to HTTP Connectors.
namespace Connector_HTTP {
  ///\brief Builds an index file for HTTP Live streaming.
  ///\param metadata The current metadata, used to generate the index.
  ///\return The index file for HTTP Live Streaming.
  std::string liveIndex(JSON::Value & metadata){
    std::stringstream Result;
    if ( !metadata.isMember("live")){
      int longestFragment = 0;
      for (JSON::ArrIter ai = metadata["frags"].ArrBegin(); ai != metadata["frags"].ArrEnd(); ai++){
        if ((*ai)["dur"].asInt() > longestFragment){
          longestFragment = (*ai)["dur"].asInt();
        }
      }
      Result << "#EXTM3U\r\n"
          "#EXT-X-TARGETDURATION:" << (longestFragment / 1000) + 1 << "\r\n"
          "#EXT-X-MEDIA-SEQUENCE:0\r\n";
      for (JSON::ArrIter ai = metadata["frags"].ArrBegin(); ai != metadata["frags"].ArrEnd(); ai++){
        Result << "#EXTINF:" << (*ai)["dur"].asInt() / 1000 << ", no desc\r\n" << (*ai)["num"].asInt() << "_" << (*ai)["len"].asInt() << ".ts\r\n";
      }
      Result << "#EXT-X-ENDLIST";
    }else{
      if (metadata["missed_frags"].asInt() < 0){
        metadata["missed_frags"] = 0ll;
      }
      Result << "#EXTM3U\r\n"
          "#EXT-X-MEDIA-SEQUENCE:" << metadata["missed_frags"].asInt() <<"\r\n"
          "#EXT-X-TARGETDURATION:30\r\n";
      for (JSON::ArrIter ai = metadata["frags"].ArrBegin(); ai != metadata["frags"].ArrEnd(); ai++){
        Result << "#EXTINF:" << (*ai)["dur"].asInt() / 1000 << ", no desc\r\n" << (*ai)["num"].asInt() << "_" << (*ai)["len"].asInt() << ".ts\r\n";
      }
    }
#if DEBUG >= 8
    std::cerr << "Sending this index:" << std::endl << Result.str() << std::endl;
#endif
    return Result.str();
  } //liveIndex

  ///\brief Main function for the HTTP Live Connector
  ///\param conn A socket describing the connection the client.
  ///\return The exit code of the connector.
  int liveConnector(Socket::Connection conn){
    std::stringstream TSBuf;
    long long int TSBufTime = 0;

    DTSC::Stream Strm; //Incoming stream buffer.
    HTTP::Parser HTTP_R, HTTP_S; //HTTP Receiver en HTTP Sender.

    bool ready4data = false; //Set to true when streaming is to begin.
    Socket::Connection ss( -1);
    std::string streamname;
    std::string recBuffer = "";

    TS::Packet PackData;
    int PacketNumber = 0;
    long long unsigned int TimeStamp = 0;
    int ThisNaluSize;
    char VideoCounter = 0;
    char AudioCounter = 0;
    bool IsKeyFrame;
    MP4::AVCC avccbox;
    bool haveAvcc = false;

    std::vector<int> fragIndices;

    std::string manifestType;

    int Segment = -1;
    int temp;
    unsigned int lastStats = 0;
    conn.setBlocking(false); //do not block on conn.spool() when no data is available

    while (conn.connected()){
      if (conn.spool() || conn.Received().size()){
        //make sure it ends in a \n
        if ( *(conn.Received().get().rbegin()) != '\n'){
          std::string tmp = conn.Received().get();
          conn.Received().get().clear();
          if (conn.Received().size()){
            conn.Received().get().insert(0, tmp);
          }else{
            conn.Received().append(tmp);
          }
        }
        if (HTTP_R.Read(conn.Received().get())){
#if DEBUG >= 5
          std::cout << "Received request: " << HTTP_R.getUrl() << std::endl;
#endif
          conn.setHost(HTTP_R.GetHeader("X-Origin"));
          streamname = HTTP_R.GetHeader("X-Stream");
          if ( !ss){
            ss = Util::Stream::getStream(streamname);
            if ( !ss.connected()){
              #if DEBUG >= 1
              fprintf(stderr, "Could not connect to server!\n");
              #endif
              HTTP_S.Clean();
              HTTP_S.SetBody("No such stream is available on the system. Please try again.\n");
              conn.SendNow(HTTP_S.BuildResponse("404", "Not found"));
              ready4data = false;
              continue;
            }
            ss.setBlocking(false);
            //make sure metadata is received
            while ( !Strm.metadata && ss.connected()){
              if (ss.spool()){
                while (Strm.parsePacket(ss.Received())){
                  //do nothing
                }
              }
            }
          }
          if (HTTP_R.url.find(".m3u") == std::string::npos){
            temp = HTTP_R.url.find("/", 5) + 1;
            Segment = atoi(HTTP_R.url.substr(temp, HTTP_R.url.find("_", temp) - temp).c_str());
            temp = HTTP_R.url.find("_", temp) + 1;
            int frameCount = atoi(HTTP_R.url.substr(temp, HTTP_R.url.find(".ts", temp) - temp).c_str());
            if (Strm.metadata.isMember("live")){
              int seekable = Strm.canSeekFrame(Segment);
              if (seekable < 0){
                HTTP_S.Clean();
                HTTP_S.SetBody("The requested fragment is no longer kept in memory on the server and cannot be served.\n");
                conn.SendNow(HTTP_S.BuildResponse("412", "Fragment out of range"));
                HTTP_R.Clean(); //clean for any possible next requests
                std::cout << "Fragment @ F" << Segment << " too old (F" << Strm.metadata["keynum"][0u].asInt() << " - " << Strm.metadata["keynum"][Strm.metadata["keynum"].size() - 1].asInt() << ")" << std::endl;
                continue;
              }
              if (seekable > 0){
                HTTP_S.Clean();
                HTTP_S.SetBody("Proxy, re-request this in a second or two.\n");
                conn.SendNow(HTTP_S.BuildResponse("208", "Ask again later"));
                HTTP_R.Clean(); //clean for any possible next requests
                std::cout << "Fragment @ F" << Segment << " not available yet (F" << Strm.metadata["keynum"][0u].asInt() << " - " << Strm.metadata["keynum"][Strm.metadata["keynum"].size() - 1].asInt() << ")" << std::endl;
                continue;
              }
            }
            std::stringstream sstream;
            sstream << "f " << Segment << "\n";
            for (int i = 0; i < frameCount; i++){
              sstream << "o \n";
            }
            ss.SendNow(sstream.str().c_str());
          }else{
            if (HTTP_R.url.find(".m3u8") != std::string::npos){
              manifestType = "audio/x-mpegurl";
            }else{
              manifestType = "audio/mpegurl";
            }
            HTTP_S.Clean();
            HTTP_S.SetHeader("Content-Type", manifestType);
            HTTP_S.SetHeader("Cache-Control", "no-cache");
            std::string manifest = liveIndex(Strm.metadata);
            HTTP_S.SetBody(manifest);
            conn.SendNow(HTTP_S.BuildResponse("200", "OK"));
          }
          ready4data = true;
          HTTP_R.Clean(); //clean for any possible next requests
        }
      }else{
        Util::sleep(1);
      }
      if (ready4data){
        unsigned int now = Util::epoch();
        if (now != lastStats){
          lastStats = now;
          ss.SendNow(conn.getStats("HTTP_Live").c_str());
        }
        if (ss.spool()){
          while (Strm.parsePacket(ss.Received())){
            if (Strm.lastType() == DTSC::PAUSEMARK){
              TSBuf.flush();
              if (TSBuf.str().size()){
                HTTP_S.Clean();
                HTTP_S.protocol = "HTTP/1.1";
                HTTP_S.SetHeader("Content-Type", "video/mp2t");
                HTTP_S.SetHeader("Connection", "keep-alive");
                HTTP_S.SetBody("");
                HTTP_S.SetHeader("Content-Length", TSBuf.str().size());
                conn.SendNow(HTTP_S.BuildResponse("200", "OK"));
                conn.SendNow(TSBuf.str().c_str(), TSBuf.str().size());
                TSBuf.str("");
                PacketNumber = 0;
              }
              TSBuf.str("");
            }
            if ( !haveAvcc){
              avccbox.setPayload(Strm.metadata["video"]["init"].asString());
              haveAvcc = true;
            }
            if (Strm.lastType() == DTSC::VIDEO || Strm.lastType() == DTSC::AUDIO){
              Socket::Buffer ToPack;
              //write PAT and PMT TS packets
              if (PacketNumber == 0){
                PackData.DefaultPAT();
                TSBuf.write(PackData.ToString(), 188);
                PackData.DefaultPMT();
                TSBuf.write(PackData.ToString(), 188);
                PacketNumber += 2;
              }

              int PIDno = 0;
              char * ContCounter = 0;
              if (Strm.lastType() == DTSC::VIDEO){
                IsKeyFrame = Strm.getPacket(0).isMember("keyframe");
                if (IsKeyFrame){
                  TimeStamp = (Strm.getPacket(0)["time"].asInt() * 27000);
                }
                ToPack.append(avccbox.asAnnexB());
                while (Strm.lastData().size()){
                  ThisNaluSize = (Strm.lastData()[0] << 24) + (Strm.lastData()[1] << 16) + (Strm.lastData()[2] << 8) + Strm.lastData()[3];
                  Strm.lastData().replace(0, 4, TS::NalHeader, 4);
                  if (ThisNaluSize + 4 == Strm.lastData().size()){
                    ToPack.append(Strm.lastData());
                    break;
                  }else{
                    ToPack.append(Strm.lastData().c_str(), ThisNaluSize + 4);
                    Strm.lastData().erase(0, ThisNaluSize + 4);
                  }
                }
                ToPack.prepend(TS::Packet::getPESVideoLeadIn(0ul, Strm.getPacket(0)["time"].asInt() * 90));
                PIDno = 0x100;
                ContCounter = &VideoCounter;
              }else if (Strm.lastType() == DTSC::AUDIO){
                ToPack.append(TS::GetAudioHeader(Strm.lastData().size(), Strm.metadata["audio"]["init"].asString()));
                ToPack.append(Strm.lastData());
                ToPack.prepend(TS::Packet::getPESAudioLeadIn(ToPack.bytes(1073741824ul), Strm.getPacket(0)["time"].asInt() * 90));
                PIDno = 0x101;
                ContCounter = &AudioCounter;
              }

              //initial packet
              PackData.Clear();
              PackData.PID(PIDno);
              PackData.ContinuityCounter(( *ContCounter)++);
              PackData.UnitStart(1);
              if (IsKeyFrame){
                PackData.RandomAccess(1);
                PackData.PCR(TimeStamp);
              }
              unsigned int toSend = PackData.AddStuffing(ToPack.bytes(184));
              std::string gonnaSend = ToPack.remove(toSend);
              PackData.FillFree(gonnaSend);
              TSBuf.write(PackData.ToString(), 188);
              PacketNumber++;

              //rest of packets
              while (ToPack.size()){
                PackData.Clear();
                PackData.PID(PIDno);
                PackData.ContinuityCounter(( *ContCounter)++);
                toSend = PackData.AddStuffing(ToPack.bytes(184));
                gonnaSend = ToPack.remove(toSend);
                PackData.FillFree(gonnaSend);
                TSBuf.write(PackData.ToString(), 188);
                PacketNumber++;
              }

            }
          }
        }
        if ( !ss.connected()){
          break;
        }
      }
    }
    conn.close();
    ss.SendNow(conn.getStats("HTTP_Live").c_str());
    ss.close();
#if DEBUG >= 5
    fprintf(stderr, "HLS: User %i disconnected.\n", conn.getSocket());
#endif
    return 0;
  } //HLS_Connector main function

} //Connector_HTTP namespace

///\brief The standard process-spawning main function.
int main(int argc, char ** argv){
  Util::Config conf(argv[0], PACKAGE_VERSION);
  conf.addConnectorOptions(1935);
  conf.parseArgs(argc, argv);
  Socket::Server server_socket = Socket::Server("/tmp/mist/http_live");
  if ( !server_socket.connected()){
    return 1;
  }
  conf.activate();

  while (server_socket.connected() && conf.is_active){
    Socket::Connection S = server_socket.accept();
    if (S.connected()){ //check if the new connection is valid
      pid_t myid = fork();
      if (myid == 0){ //if new child, start MAINHANDLER
        return Connector_HTTP::liveConnector(S);
      }else{ //otherwise, do nothing or output debugging text
#if DEBUG >= 5
        fprintf(stderr, "Spawned new process %i for socket %i\n", (int)myid, S.getSocket());
#endif
      }
    }
  } //while connected
  server_socket.close();
  return 0;
} //main
