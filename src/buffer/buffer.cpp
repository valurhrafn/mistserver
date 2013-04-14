/// \file buffer.cpp
/// Contains the main code for the Buffer.

#include <fcntl.h>
#include <iostream>
#include <string>
#include <vector>
#include <cstdlib>
#include <cstdio>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <sstream>
#include <sys/time.h>
#include <mist/config.h>
#include "buffer_stream.h"
#include <mist/stream.h>

/// Holds all code unique to the Buffer.
namespace Buffer {

  volatile bool buffer_running = true; ///< Set to false when shutting down.
  Stream * thisStream = 0;
  Socket::Server SS; ///< The server socket.

  ///\brief Gets the current system time in milliseconds.
  ///\return The current timestamp in milliseconds.
  long long int getNowMS(){
    timeval t;
    gettimeofday( &t, 0);
    return t.tv_sec * 1000 + t.tv_usec / 1000;
  } //getNowMS

  ///\brief A function running in a thread to send all statistics.
  ///\param empty A null pointer.
  void handleStats(void * empty){
    if (empty != 0){
      return;
    }
    std::string double_newline = "\n\n";
    Socket::Connection StatsSocket = Socket::Connection("/tmp/mist/statistics", true);
    while (buffer_running){
      usleep(1000000); //sleep one second
      Stream::get()->cleanUsers();
      if ( !StatsSocket.connected()){
        StatsSocket = Socket::Connection("/tmp/mist/statistics", true);
      }
      if (StatsSocket.connected()){
        Stream::get()->getReadLock();
        StatsSocket.Send(Stream::get()->getStats());
        Stream::get()->dropReadLock();
        StatsSocket.SendNow(double_newline);
      }
    }
    StatsSocket.close();
  }

  ///\brief A function running in a thread to handle a new user connection.
  ///\param v_usr The user that is connected.
  void handleUser(void * v_usr){
    user * usr = (user*)v_usr;
#if DEBUG >= 5
    std::cerr << "Thread launched for user " << usr->MyStr << ", socket number " << usr->S.getSocket() << std::endl;
#endif

    Stream::get()->getReadLock();
    usr->myRing = thisStream->getRing();
    if (thisStream->getStream()->metadata && thisStream->getHeader().size() > 0){
      usr->S.SendNow(thisStream->getHeader());
    }
    Stream::get()->dropReadLock();
    //Added by Valur Hrafn for sending the last metapack to new streams
    Stream::get()->getReadLock();
    if (thisStream->getStream()->lastmetapack){
      usr->S.SendNow(thisStream->getStream()->lastmetapack.toNetPacked());
    }
    Stream::get()->dropReadLock();
    while (usr->S.connected()){
      usleep(5000); //sleep 5ms
      if ( !usr->myRing->playCount || !usr->Send()){
        if (usr->myRing->updated){
          Stream::get()->getReadLock();
          usr->S.SendNow(Stream::get()->getStream()->metadata.toNetPacked());
          Stream::get()->dropReadLock();
          usr->myRing->updated = false;
        }
        if (usr->S.spool()){
          while (usr->S.Received().size()){
            //delete anything that doesn't end with a newline
            if ( !usr->S.Received().get().empty() && *(usr->S.Received().get().rbegin()) != '\n'){
              usr->S.Received().get().clear();
              continue;
            }
            usr->S.Received().get().resize(usr->S.Received().get().size() - 1);
            if ( !usr->S.Received().get().empty()){
              switch (usr->S.Received().get()[0]){
                case 'P': { //Push
                  std::cout << "Push attempt from IP " << usr->S.Received().get().substr(2) << std::endl;
                  if (thisStream->checkWaitingIP(usr->S.Received().get().substr(2))){
                    usr->S.Received().get().clear();
                    if (thisStream->setInput(usr->S)){
                      std::cout << "Push accepted!" << std::endl;
                      usr->S = Socket::Connection( -1);
                      return;
                    }else{
                      usr->Disconnect("Push denied - push already in progress!");
                    }
                  }else{
                    usr->Disconnect("Push denied - invalid IP address!");
                  }
                  break;
                }
                case 'S': { //Stats
                  usr->tmpStats = Stats(usr->S.Received().get().substr(2));
                  unsigned int secs = usr->tmpStats.conntime - usr->lastStats.conntime;
                  if (secs < 1){
                    secs = 1;
                  }
                  usr->curr_up = (usr->tmpStats.up - usr->lastStats.up) / secs;
                  usr->curr_down = (usr->tmpStats.down - usr->lastStats.down) / secs;
                  usr->lastStats = usr->tmpStats;
                  thisStream->saveStats(usr->MyStr, usr->tmpStats);
                  break;
                }
                case 's': { //second-seek
                  unsigned int ms = JSON::Value(usr->S.Received().get().substr(2)).asInt();
                  usr->myRing->waiting = false;
                  usr->myRing->starved = false;
                  usr->myRing->b = thisStream->getStream()->msSeek(ms);
                  if (usr->myRing->playCount > 0){
                    usr->myRing->playCount = 0;
                  }
                  break;
                }
                case 'f': { //frame-seek
                  unsigned int frameno = JSON::Value(usr->S.Received().get().substr(2)).asInt();
                  usr->myRing->waiting = false;
                  usr->myRing->starved = false;
                  usr->myRing->b = thisStream->getStream()->frameSeek(frameno);
                  if (usr->myRing->playCount > 0){
                    usr->myRing->playCount = 0;
                  }
                  break;
                }
                case 'p': { //play
                  usr->myRing->playCount = -1;
                  break;
                }
                case 'o': { //once-play
                  if (usr->myRing->playCount >= 0){
                    usr->myRing->playCount++;
                  }
                  break;
                }
                case 'q': { //quit-playing
                  usr->myRing->playCount = 0;
                  break;
                }
              }
              usr->S.Received().get().clear();
            }
          }
        }
      }
    }
    usr->Disconnect("Socket closed.");
  }

  ///\brief A function running a thread to handle input data through stdin.
  ///
  ///Automatically slows down to realtime playback.
  ///\param empty A null pointer.
  void handleStdin(void * empty){
    if (empty != 0){
      return;
    }
    long long int timeDiff = 0; //difference between local time and stream time
    unsigned int lastPacket = 0; //last parsed packet timestamp
    std::string inBuffer;
    char charBuffer[1024 * 10];
    unsigned int charCount;
    long long int now;

    while (std::cin.good() && buffer_running){
      //slow down packet receiving to real-time
      now = getNowMS();
      if (((now - timeDiff) >= lastPacket) || (lastPacket - (now - timeDiff) > 15000)){
        thisStream->getWriteLock();
        if (thisStream->getStream()->parsePacket(inBuffer)){
          thisStream->getStream()->outPacket(0);
          lastPacket = thisStream->getStream()->getTime();
          if ((now - timeDiff - lastPacket) > 15000 || (now - timeDiff - lastPacket < -15000)){
            timeDiff = now - lastPacket;
          }
          thisStream->dropWriteLock(true);
        }else{
          thisStream->dropWriteLock(false);
          std::cin.read(charBuffer, 1024 * 10);
          charCount = std::cin.gcount();
          inBuffer.append(charBuffer, charCount);
        }
      }else{
        usleep(std::min(14999LL, lastPacket - (now - timeDiff)) * 1000);
      }
    }
    buffer_running = false;
  }

  ///\brief A function running a thread to handle input data through rtmp push.
  ///\param empty A null pointer.
  void handlePushin(void * empty){
    if (empty != 0){
      return;
    }
    while (buffer_running){
      if (thisStream->getIPInput().connected()){
        if (thisStream->getIPInput().spool()){
          bool packed_parsed = false;
          do{
            thisStream->getWriteLock();
            if (thisStream->getStream()->parsePacket(thisStream->getIPInput().Received())){
              thisStream->getStream()->outPacket(0);
              thisStream->dropWriteLock(true);
              packed_parsed = true;
            }else{
              thisStream->dropWriteLock(false);
              packed_parsed = false;
              usleep(1000); //1ms wait
            }
          }while (packed_parsed);
        }else{
          usleep(1000); //1ms wait
        }
      }else{
        usleep(1000000); //1s wait
      }
    }
  }

  ///\brief Starts a loop, waiting for connections to send data to.
  ///\param argc The number of arguments to the program.
  ///\param argv The arguments to the program.
  ///\return The return code of the buffer.
  int Start(int argc, char ** argv){
    Util::Config conf = Util::Config(argv[0], PACKAGE_VERSION);
    conf.addOption("stream_name",
        JSON::fromString("{\"arg_num\":1, \"arg\":\"string\", \"help\":\"Name of the stream this buffer will be providing.\"}"));
    conf.addOption("awaiting_ip",
        JSON::fromString(
            "{\"arg_num\":2, \"arg\":\"string\", \"default\":\"\", \"help\":\"IP address to expect incoming data from. This will completely disable reading from standard input if used.\"}"));
    conf.addOption("reportstats",
        JSON::fromString("{\"default\":0, \"help\":\"Report stats to a controller process.\", \"short\":\"s\", \"long\":\"reportstats\"}"));
    conf.addOption("time",
        JSON::fromString(
            "{\"default\":0, \"arg\": \"integer\", \"help\":\"Buffer a specied amount of time in ms.\", \"short\":\"t\", \"long\":\"time\"}"));
    conf.parseArgs(argc, argv);

    std::string name = conf.getString("stream_name");

    SS = Util::Stream::makeLive(name);
    if ( !SS.connected()){
      perror("Could not create stream socket");
      return 1;
    }
    conf.activate();
    thisStream = Stream::get();
    thisStream->setName(name);
    thisStream->getStream()->setBufferTime(conf.getInteger("time"));
    Socket::Connection incoming;
    Socket::Connection std_input(fileno(stdin));

    tthread::thread * StatsThread = 0;
    if (conf.getBool("reportstats")){
      StatsThread = new tthread::thread(handleStats, 0);
    }
    tthread::thread * StdinThread = 0;
    std::string await_ip = conf.getString("awaiting_ip");
    if (await_ip == ""){
      StdinThread = new tthread::thread(handleStdin, 0);
    }else{
      thisStream->setWaitingIP(await_ip);
      StdinThread = new tthread::thread(handlePushin, 0);
    }

    while (buffer_running && SS.connected() && conf.is_active){
      //check for new connections, accept them if there are any
      //starts a thread for every accepted connection
      incoming = SS.accept(true);
      if (incoming.connected()){
        user * usr_ptr = new user(incoming);
        thisStream->addUser(usr_ptr);
        usr_ptr->Thread = new tthread::thread(handleUser, (void *)usr_ptr);
      }
    } //main loop

    // disconnect listener
    buffer_running = false;
    std::cout << "Buffer shutting down" << std::endl;
    SS.close();
    if (StatsThread){
      StatsThread->join();
      delete StatsThread;
    }
    if (thisStream->getIPInput().connected()){
      thisStream->getIPInput().close();
    }
    StdinThread->join();
    delete StdinThread;
    delete thisStream;
    return 0;
  }

}
;
//Buffer namespace

///\brief Entry point for Buffer, simply calls Buffer::Start().
int main(int argc, char ** argv){
  return Buffer::Start(argc, argv);
} //main
