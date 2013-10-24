
/**
 * Local settings page
 * DDVTECH
 * for more information, see http://mistserver.org/index.php?title=Stand-alone_Configuration_Page
 */
 
 
/**
 * Store a local copy of the data send by the server.
 * server is the URL, credentials hold the username, password and authstring and settings is the local copy.
 */
  var settings =
  {
    server: '',
    credentials:
    {
      username: "",
      password: "",
      authstring: ""
    },
    settings: {}
  };
  
  
/**
 *  Table for long/short limit names
 */
  var ltypes =
  [
    ['kbps_max', 'Current bandwidth'],
    ['users', 'Concurrent users'],
    ['geo', 'Geolimited'],
    ['host', 'Hostlimited']
  ];
  
  /* Not currently supported but may return at a later time:
    ['kb_total', 'Total bandwidth'],
    ['duration', 'Duration'],
    ['str_kbps_min', 'Minimum bitrate'],
    ['str_kbps_max', 'Maximum bitrate']
  /*
  
  
/**
 *  When the page loads, fix the menu and show the correct tab
 */
  $(document).ready(function()
  {
    $('#nav').children().each(function()
    {
      $(this).click(function()
      {
        // remove currently selected' class
        $('#nav').children().each(function()
        {
          $(this).attr('class', '');
        });
        
        // select this one
        $(this).attr('class', 'selected');
        
        // show correct tab
        var t = $(this).text() || $(this).children('a').text();
        showTab(t);
      });
      
    });
    
    // show login 'tab' and hide menu
    showTab('login');
    $('#nav').css('visibility', 'hidden');
  });
  
  
  // used on the overview and streams page. cleared when switching to another 'tab'.
  var sinterval = null;
  
  // and this one is used on the protocols page.
  var pinterval = null;
  
  // ..and the logs page.
  var logsinterval = null;
  
  // what kind of streams should be displayed? Format is [recorded, live];
  var streamsdisplay = [true, true];
  
  // used on the overview page to decide then to ask the controller for an update check
  var updatelastchecked;
  
/**
 * Display a certain page. It contains a (giant) switch-statement, that builds a page depending on the tab requested
 * @param name the name of the tab
 * @param streamname only used when editing streams or protocols, the name of the edited (or new) stream/protocol. Also used with the 'embed' tab
 */
  function showTab(name, streamname)
  {
    // clear page and refresh interval
    $('#page').html('');
    clearInterval(sinterval);
    clearInterval(pinterval);
    clearInterval(logsinterval);
    
    $('#page').removeClass('LTS-only');
    $('#page').off('mouseenter mouseleave');
    removeTooltip();
    
    switch(name)
    {
      case 'login':
      
        var host = $('<input>').attr('type', 'text').attr('placeholder', 'HTTP://' + (location.host == '' ? 'localhost:4242' : location.host) + '/api');
        var user = $('<input>').attr('type', 'text').attr('placeholder', 'USERNAME');
        var pass = $('<input>').attr('type', 'password').attr('placeholder', 'PASSWORD');
        var conn = $('<button>').click(function()	
        {
          // get login info
          settings.credentials.username = user.val();
          settings.credentials.password = pass.val();
          settings.server = host.val() == '' ? host.attr('placeholder') : host.val().toLowerCase();
          
          // save username, URL in address
          location.hash = user.val() + '@' + settings.server;
          
          // try to login
          setHeaderState('logingin');
          
          loadSettings(function(errorstr)
          {
            if(errorstr == '')
            {
              setHeaderState('connected');
              
              $('#nav').css('visibility', 'visible');
              
              showTab('overview');
              
              // show overview as current tab - this only happens when logging out and then in
              $('#nav').children().each(function()
              {
                if($(this).text() != 'overview')
                {
                  $(this).attr('class', '');
                }else{
                  $(this).attr('class', 'selected');
                }
              });
              
            }else{
              setHeaderState('disconnected');
              $('#header-host').text('');
              $('#page').append($('<p>').text(errorstr));
            }
          });
        }).text('login');
        
        $('#page').append(
          $('<div>').attr('id', 'login').append(host).append(user).append(pass).append(conn)
        );
        
        // if we 'enter' in host, user or pass we should try to login.
        function hand(e)
        {
          if(e.keyCode == 13)
          {
            conn.trigger('click');  // conn = login button
          }
        }
        
        host.keypress(hand);
        user.keypress(hand);
        pass.keypress(hand);
        
        // retrieve address hash from URL
        var adr = location.hash.replace('#', '').split('@');
        
        if(adr.length == 2)
        {
          // put it in the page
          host.val(adr[1]);
          user.val(adr[0]);
        }
        
        break;
        
        
      case 'overview':
        
        
        loadSettings(function(){
        
          $uptodate = null;
          if (settings.settings.LTS == 1)
          {
            if ((settings.settings.update == undefined) || (updatelastchecked == undefined) || ((new Date()).getTime() - updatelastchecked > 3600000))
            {
              settings.settings.checkupdate = true;
              settings.settings.update = {};
              updatelastchecked = (new Date()).getTime();
              loadSettings(function()
              { 
                showTab('overview'); 
              });
            }
            else
            {
              if (settings.settings.update.uptodate == 0)
              {
                $uptodate = $('<label>').text('version check').css('line-height','30px');
                $uptodate.append(
                  $('<span>').attr('class','red').text('Outdated version!').append(
                    $('<button>').text('update').click(function(){
                      settings.settings.autoupdate = true;
                      loadSettings();
                    })
                  )
                );
              }
            }
          }
          if (settings.settings.config.basepath == undefined) 
          {
            settings.settings.config.basepath = "";
          }
          
          $('#page').append(
            $('<div>').attr('id', 'editserver').append(
              $('<label>').attr('for', 'config-host').text('host').append(
                $('<input>').attr('type', 'text').attr('placeholder', 'HOST').attr('id', 'config-host').attr('value', settings.settings.config.host)
              )
            ).append(
              $('<label>').attr('for', 'config-name').text('name').append(
                $('<input>').attr('type', 'text').attr('placeholder', 'NAME').attr('id', 'config-name').attr('value', settings.settings.config.name)
              )
            ).append(
              $('<label>').text('Version').append(
                $('<span>').text(settings.settings.config.version)
              ).append($uptodate)
            ).append(
              $('<label>').text('Base path').append(
                $('<input>').attr('type','text').attr('placeholder','BASE PATH').attr('id','config-basepath').val(settings.settings.config.basepath)
              )
            ).append(
              $('<label>').text('time').append(
                $('<span>').text( formatDate(settings.settings.config.time) )
              )
            ).append(
              $('<label>').text('Streams').append(
                $('<span>').attr('id', 'cur_streams_online').text('retrieving data...')
              )
            ).append(
              $('<label>').text('Viewers').append(
                $('<span>').attr('id', 'cur_num_viewers').text('retrieving data...')
              )
            )
          );
          
          function showStats()
          {
            getStatData(function(data)
            {
              $('#cur_streams_online').html('').text(data.streams[0] + ' of ' + data.streams[1] + ' online');
              $('#cur_num_viewers').html('').text(data.viewers);
            });
          }
          
          // refresh the stream status + viewers
          sinterval = setInterval(function()
          {
            showStats();
          }, 10000);
          
          showStats();
          
          $('#editserver').append(
            $('<button>').attr('class', 'floatright').click(function()
            {
              var host = $('#config-host').val();
              var name = $('#config-name').val();
              var path = $('#config-basepath').val();
              
              settings.settings.config.host = host;
              settings.settings.config.name = name;
              settings.settings.config.basepath = path;
              
              loadSettings(function()
              {
                showTab('overview');
              });
            }).text( 'save' )
          );
          
          var forcesave = $('<div>').attr('id', 'forcesave');
          
          forcesave.append(
            $('<p>').text('Click the button below to force an immediate settings save. This differs from a regular save to memory and file save on exit by saving directly to file while operating. This may slow server processes for a short period of time.')
          ).append(
            $('<button>').click(function()
            {
              if(confirmDelete('Are you sure you want to force a JSON save?') == true)
              {
                var host = $('#config-host').val();
                var name = $('#config-name').val();
                var path = $('#config-basepath').val();
                
                settings.settings.config.host = host;
                settings.settings.config.name = name;
                settings.settings.config.basepath = path;
                
                loadSettings(function()
                {
                  forceJSONSave();
                  showTab('overview');
                });
              }
            }).text( 'force save to JSON file' )
          );
          
          $('#page').append(forcesave);
        });
        
        break;
        
        
      case 'protocols':
        
        $table = $('<table>');
        $table.html("<thead><th>Protocol</th><th>Status</th><th>Settings</th><th></th></thead>");
        $tbody = $('<tbody>');
        
        var tr, i, protocol,
          len = (settings.settings.config.protocols ? settings.settings.config.protocols.length : 0);
        
        $tbody.html('');
        pids = [];
        
        for(i = 0; i < len; i++)
        {
          protocol = settings.settings.config.protocols[i];  // local copy
          pids.push(i);
          
          tr = $('<tr>').attr('id', 'protocol-' + i);
          
          tr.append( $('<td>').text( protocol.connector ) );
          
          //tr.append( $('<td>').html( formatStatus( protocol.online ) ) );
          tr.append( $('<td>').html(formatStatus()));
          
          s = "";
          for (option in protocol) 
          {
            if ((option != 'connector') && (option != 'online')) 
            {
              s += option+': '+((protocol[option] == '') ||  (protocol[option] == 0) ? 'default' : protocol[option] )+', ';
            }
          }
          s = s.slice(0,-2);
            
          tr.append( $('<td>').text( s ) ); 
          
          tr.append( $('<td>').attr('class', 'center').append( $('<button>').text('edit').click(function()
          {
            id = $(this).parent().parent().attr('id').replace('protocol-', '');
            showTab('editprotocol', id);
          }) ).append( $('<button>').click(function()
          {
            if(confirmDelete('Are you sure you want to delete this protocol?') == true)
            {
              var id = Number($(this).parent().parent().attr('id').replace('protocol-', ''));
              var pid = pids.indexOf(id);
              settings.settings.config.protocols.splice(pid, 1);
              loadSettings(function()
              {
                showTab('protocols');
              });
            }
          }).text('delete') ) );
          
          $tbody.append(tr);
        }
          
        $table.append($tbody);
        $('#page').append($table);
           
        $('#page').append(
          $('<button>').attr('class', 'floatright').click(function()
          {
            showTab('editprotocol', 'new');
          }).text('add new')
        );
        
        function refreshProtocolStatus() 
        {
          getData(function(data)
          {
            $('tbody tr').each(function()
            {
              protocolstatus = null;
              pid = $(this).attr('id').split('-')[1];
              if (data.config.protocols[pid] == undefined) 
              { 
                protocolstatus = 'Protocol config missing.. reloading tab'; 
                showTab('protocol');
              }
              else {
                if (data.config.protocols[pid].online == undefined) 
                {
                  setTimeout(function()
                  {
                    refreshProtocolStatus();
                  },1000);
                }
                protocolstatus = data.config.protocols[pid].online;
              }
              $(this).children(':nth-child(2)').html( formatStatus( protocolstatus ) );
            });
          });
        }
        
        pinterval = setInterval(function()
        {
          refreshProtocolStatus();
        },10000);
        refreshProtocolStatus();
        
        break;
        
      case 'editprotocol':
        if (streamname != 'new') 
        { 
          currentdata = settings.settings.config.protocols[streamname]; 
        }
        
        currentconnectors = [];
        // build a list of the current connectors to see if the dependencies are already configured
        for (var index in settings.settings.config.protocols) 
        { 
          currentconnectors.push(settings.settings.config.protocols[index].connector.replace('.exe',''));
        }
        
        function buildProtocolParameterFields(data,required)
        {
          for (fieldname in data)
          {
            switch(data[fieldname].type)
            {
              case 'str':
                var inputType = 'text'
                break;
              case 'uint':
                var inputType = 'number'
                var func = 'uint'
                break;
              case 'int':
                var inputType = 'number'
                break;
            }
            $i = $('<input>').attr('type',inputType).attr('id','protocol-parameter-'+fieldname);
            if (func == 'uint') 
            {
              $i.addClass('uint');
            }
            if (required) 
            {
              $i.addClass('required');
            }
            $protocolfields.append(
              $('<label>').text(data[fieldname].name).attr('title',data[fieldname].help+'.').append($i)
            );
          }
        }
        
        function buildProtocolFields(selectedProtocol) 
        {
          data = settings.settings.capabilities.connectors[selectedProtocol];
          
          $t = $('<p>').text(data.desc);
          if ((typeof data.deps != 'undefined') && (data.deps))
          {
            $t.append($('<p>').text('Dependencies:'));
            $s = $('<ul>');
            deps = data.deps.split(',');
            for (var index in deps) 
            {
              t = deps[index];
              if ($.inArray(deps[index],currentconnectors) < 0) 
              {
                $u = $('<span>').text(' (Not yet configured!)').addClass('red');
              }else{
                $u = $('<span>').text(' (Configured)').addClass('green');
              }
              $s.append($('<li>').text(t).append($u));
            }
            $t.append($s);
          }						 
          $('#protocoldesc').html( $t );
          
          $protocolfields = $('<div>');
          if (typeof data.required != 'undefined') 
          {
            $protocolfields.append( $('<p>').text('Required parameters') );
            buildProtocolParameterFields(data.required,true);
          }
          if (typeof data.optional != 'undefined') 
          {
            $protocolfields.append( $('<p>').text('Optional parameters') );
            buildProtocolParameterFields(data.optional,false);
          }
          $('#protocolfields').html($protocolfields);
          if (streamname != 'new') 
          {
            for (fieldname in currentdata) 
            {
              if ((fieldname != 'connector') && (fieldname != 'online')) 
              { 
                $('#protocol-parameter-'+fieldname).val(currentdata[fieldname]);
              }
            }
          }
        }
          
        loadSettings(function()
        {
          if (streamname == 'new') { t = 'add new protocol'; }
          else { t = 'edit protocol'; }
          
          $('#page').append( $('<p>').text(t) );
          
          $selectprotocol = $('<select>').attr('id', 'edit-protocol').change(function()
          {
            buildProtocolFields($(this).children(':selected').val());
          });
          for(protocol in settings.settings.capabilities.connectors)
          {
            if ((streamname != 'new') && (currentdata.connector == protocol)) {
              $selectprotocol.append(
                $('<option>').attr('value', protocol).attr('selected','selected').text(protocol)
              );
            }else{
              $selectprotocol.append(
                $('<option>').attr('value', protocol).text(protocol)
             );
            }
          }
          
          $div = $('<div>').attr('id', 'editprotocol');
          $div.append( 
            $('<label>').attr('for', 'protocol-edit-protocol').text('protocol').append(
              $selectprotocol
            )
          );
          
          $('#page').append( $div );
          $('#editprotocol').append( $('<div>').attr('id','protocoldesc') );
          $('#editprotocol').append( $('<div>').attr('id','protocolfields') );
          $('#editprotocol').append(
            $('<button>').text('cancel').addClass('floatright').click(function()
            {
              showTab('protocols');
            })
          );
          $('#editprotocol').append(
            $('<button>').text('save').addClass('floatright').click(function()
            {
              error = false;
              //check if all required fields have contents
              $('input.required').each(function()
              { 
                if ($(this).val() == '') 
                {
                  $(this).focus();
                  $(this).parent().addClass('red');
                  error = true;
                }
              });
              
              $('input[type="number"]').each(function(){
                if ($(this).val() != '') {
                  //make sure this is a number
                  if (isNaN($(this).val())) 
                  {
                    $(this).focus();
                    $(this).parent().addClass('red');
                    error = true;
                  }
                  else
                  {
                    //turn all numbers into integers
                    $(this).val(Math.floor($(this).val()));
                    if ($(this).val() == 0) {
                      $(this).val('');
                    }
                  }
                }
              });
              //check if all uints are actually uints
              $('input.uint').each(function()
              { 
                if ($(this).val() < 0) 
                {
                  $(this).focus();
                  $(this).parent().addClass('red');
                  error = true;
                }
              });
              if (error) { return; }
              if(!settings.settings.config.protocols)
              {
                settings.settings.config.protocols = [];
              }
              
              connectorval = $('#edit-protocol').val()
              var newprotocol =
              {
                connector: connectorval
              };
              
              $('input').each(function(){
                
                if($(this).val() != '')
                {
                  newprotocol[$(this).attr('id').split('-')[2]] = $(this).val();
                }
              });
              
              newprotocol.online = -1;
              if (streamname == 'new') {
                settings.settings.config.protocols.push(newprotocol);
              }else{
                settings.settings.config.protocols[streamname] = newprotocol;
              }
              
              loadSettings(function()
              {
                showTab('protocols');
              });
            })
          );
          
          buildProtocolFields($('select#edit-protocol :selected').val());
          
        });
        
        break;
        
      case 'streams':
        
        // the filter element containr
        $div = $('<div>').attr('id', 'streams-filter');
        
        // filters the table. uses the streamsdisplay
        function filterTable()
        {
          $('#streams-list-tbody').children().each(function(k, v)
          {
            var type = $($(v).children()[1]).text().toLowerCase();
            
            $(v).show();
            
            if(type == 'recorded' && streamsdisplay[0] == false)
            {
              $(v).hide();
            }
            
            if(type == 'live' && streamsdisplay[1] == false)
            {
              $(v).hide();
            }
          });
        }
        
        function filterOn(event, elem)
        {
          if(event.target.id == '')
          {
            return;  // label click goes bubbles on checkbox, so ignore it
          }
          
          var what = $(elem).text();
          
          if(what == 'recorded')
          {
            streamsdisplay[0] = !streamsdisplay[0];
            $('#stream-filter-recorded').attr('checked', streamsdisplay[0]);
          }else{
            streamsdisplay[1] = !streamsdisplay[1];
            $('#stream-filter-live').attr('checked', streamsdisplay[1]);
          }
          
          filterTable();
        }
        $div.append(
          $('<label>').attr('for', 'stream-filter-recorded').text('recorded').append(
            $('<input>').attr('type', 'checkbox').attr('id', 'stream-filter-recorded').attr('checked', streamsdisplay[0])
              ).click(function(event)
              {
                filterOn(event, this);
              })
        );
        $div.append(
          $('<label>').attr('for', 'stream-filter-live').text('live').append(
            $('<input>').attr('type', 'checkbox').attr('id', 'stream-filter-live').attr('checked', streamsdisplay[1])
              ).click(function(event)
              {
                filterOn(event, this);
              })
        );
        $('#page').append($div);
        
        // refresh every streams' data (status and viewer count)
        function refreshStreams()
        {
          getStreamsData(function(streams)
          {
            $('tbody#streams-list-tbody tr').each(function()
            {
              streamstatus = null;
              stream = $(this).attr('id').split('-')[1];
              if (streams[stream] == undefined) 
              { 
                streamstatus = 'Stream config missing - reloading tab'; 
                showTab('streams');
              }
              else
              {
                if (streams[stream][2])
                {
                  //there is an error
                  streamstatus = formatStatus(streams[stream][0],streams[stream][2]);
                }
                else
                {
                  streamstatus = formatStatus(streams[stream][0]);
                }
                $(this).children(':nth-child(5)').html(formatStatus(streamstatus));
                $(this).children(':nth-child(6)').html(streams[stream][1]);
              }
            });
          });
        };
        
        sinterval = setInterval(function()
        {
          refreshStreams();
        }, 10000);
        
        refreshStreams();
        
        $table = $('<table>');
        $table.html("<thead><th class=sort-type-int>Id</th><th class=sort-type-string>Type</th><th class=dontsort>Embed</th><th class='sort-type-string sortdesc'>Name</th><th class=sort-type-string>Status</th><th class=sort-type-int>Viewers</th><th class=dontsort>Edit</th></thead>");
        $tbody = $('<tbody>');
            
        var stream, cstr, $tr;
        
        $tbody.html('').attr('id', 'streams-list-tbody');
        
        for(stream in settings.settings.streams)
        {
          
          //backwards compatibility
          //if sid does not yet exist, create it
          if (settings.settings.streams[stream].sid == undefined) 
          {
            sid = 0;
            for (strm in settings.settings.streams)
            {
              if (settings.settings.streams[strm].sid != undefined) 
              { 
                sid = Math.max(sid,settings.settings.streams[strm].sid); 
              }
            }
            sid += 1;
            settings.settings.streams[stream].sid = sid;
          }
          //if .source does not exist, create it
          if ((settings.settings.streams[stream].source == undefined) && (settings.settings.streams[stream].channel != undefined))
          {
            settings.settings.streams[stream].source = settings.settings.streams[stream].channel.URL;
          }
          
          var cstr = settings.settings.streams[stream];
          
          $tr = $('<tr>').attr('id', 'stream-' + stream);
          
          $tr.append( $('<td>').text( cstr.sid ) );
          
          $tr.append( $('<td>').text( TypeofResource( cstr.source ) ) );
          
          $tr.append( $('<td>').append( $('<button>').text('embed').click(function()
          {
            var sname = $(this).parent().parent().attr('id').replace('stream-', '');
            showTab('embed', sname);
          }) ) );  // end function, end click(), end append(), end append(). Huzzah jQuery.
          
          if ( cstr.name == undefined ) { cstr.name = ''; }
          
          $tr.append( $('<td>').text( cstr.name ) );
          
          /*
          if (cstr.error) 
          {
            $tr.append( $('<td>').html( formatStatus( cstr.online, cstr.error ) ) );
          }
          else
          {
            $tr.append( $('<td>').html( formatStatus( cstr.online ) ) );
          }*/
          $tr.append( $('<td>').html( formatStatus() ) );
          
          var cviewers = 0;
          
          if(settings.settings.statistics && settings.settings.statistics[stream])
          {
            if(settings.settings.statistics[stream] && settings.settings.statistics[stream].curr)
            {
              for(viewer in settings.settings.statistics[stream].curr)
              {
                cviewers++;
              }
            }
          }else{
            cviewers = 0;
          }
          
          $tr.append( $('<td>').text( cviewers ) );
          
          $tr.append( $('<td>').append( $('<button>').text('edit').click(function()
          {
            var sname = $(this).parent().parent().attr('id').replace('stream-', '');
            
            showTab('editstream', sname);
          }) ) );  // end function, end click, end append, end append.
          
          $tbody.append($tr);
          
          //quickly re-check if the streams are online now
          if (cstr.online == undefined) 
          {
            setTimeout(function()
            {
              refreshStreams();
            }, 1000);
          }
        }
        
        $table.append($tbody).addClass('sortable');
        $table.stupidtable();
        $('#page').append($table);
        
        // on page load, also filter with the (users' defined) stream filter
        filterTable();
        
        $('#page').append(
          $('<button>').attr('class', 'floatright').click(function()
          {
            showTab('editstream', 'new');
          }).text('add new')
        );
        
        break;
        
      case 'editstream':
        
        var sdata, title;
        
        if(streamname == 'new')
        {
          sdata =
          {
            'name': '',
            'source': '',
            'limits': [],
            'preset':
            {
              'cmd': ''
            }
          };
          title = 'add new stream';
        }else{
          sdata = settings.settings.streams[streamname];
          title = 'edit stream "' + sdata.name + '"';
        }
        sdata = $.extend({
          'name': '',
          'source': '',
          'limits': [],
          'preset':
          {
            'cmd': ''
          },
          'contentkey':'',
          'keyid':'',
          'keyseed':''
        },sdata);
          
        $('#page').append( $('<p>').text(title) );
          
        $('#page').append(
          $('<div>').attr('id', 'editserver').append(
            $('<label>').attr('for', 'stream-edit-name').text('name*').append(
              $('<input>').attr('type', 'text').attr('placeholder', 'NAME').attr('id', 'stream-edit-name').attr('value', sdata.name)
            )
          ).append(
            $('<label>').attr('for', 'stream-edit-source').text('source').append(
              $('<input>').attr('type', 'text').attr('placeholder', '/path/name.dtsc or push://host/name').attr('id', 'stream-edit-source').attr('value', sdata.source).keyup(function(){
                var text = $(this).val();
                if(text.charAt(0) == '/'){
                  $('.live-only').hide();
                  $('.live-only').children('label').children('input').val('');
                }
                else{
                  $('.live-only').show();
                }
              })
            )
          )
        );
        
        // BUFFER
        if (sdata.DVR == undefined) { var DVR = ''; } else { var DVR = sdata.DVR; }
        $('#editserver').append(
          $('<span>').addClass('live-only').append(
            $('<label>').attr('id','stream-edit-buffer-label').attr('for','stream-edit-buffer').attr('title','Only applies to live streams.').text('Buffer time [ms]').append(
             $('<input>').attr('type','text').attr('placeholder','2 keyframes').attr('id','stream-edit-buffer').attr('value', DVR)
            )
          )
        );
        
        // RECORD
        if (sdata.record == undefined) { var record = ''; } else { var record = sdata.record; }
        $('#editserver').append(
          $('<span>').addClass('live-only').addClass('LTS-only').append(
            $('<label>').attr('id','stream-edit-record-label').attr('for','stream-edit-record').attr('title','Only applies to live streams.').text('Record to:').append(
             $('<input>').attr('type','text').attr('placeholder','2 keyframes').attr('id','stream-edit-record').attr('value', record).attr('placeholder','/path/to/filename.dtsc')
            )
          )
        );
        
        // ENCRYPT
        $('#editserver').append(
          $('<span>').addClass('LTS-only').append(
            $('<br>')
          ).append(
            $('<p>').text('Encrypt this stream')
          ).append(
            $('<label>').attr('id','stream-edit-contentkey-label').attr('for','stream-edit-contentkey').text('Content key').append(
             $('<input>').attr('type','text').attr('id','stream-edit-contentkey').attr('value', sdata.contentkey)
            )
          ).append(
            $('<span>').text('- or -')
          ).append(
            $('<label>').attr('id','stream-edit-keyid-label').attr('for','stream-edit-keyid').text('Key ID').append(
             $('<input>').attr('type','text').attr('id','stream-edit-keyid').attr('value', sdata.keyid)
            )
          ).append(
            $('<label>').attr('id','stream-edit-keyseed-label').attr('for','stream-edit-keyseed').text('Key seed').append(
             $('<input>').attr('type','text').attr('id','stream-edit-keyseed').attr('value', sdata.keyseed)
            )
          ).append(
            $('<br>')
          )
        );
        
        var text = $('#stream-edit-source').val();
        //if the source is not live, show any stuff marked as live-only
        if(text.charAt(0) == '/')
        {
          $('.live-only').hide();
          $('.live-only').children('label').children('input').val('');
        }else{
          $('.live-only').show();
        }
        
        $('#editserver').append(
          $('<button>').attr('class', 'floatright').click(function()
          {
            if(streamname == 'new')
            {
              showTab('streams');
            }else{
              if(confirmDelete('Are you sure you want to delete the stream "' + settings.settings.streams[streamname].name + '"?') == true)
              {
                delete settings.settings.streams[streamname];
                loadSettings(function()
                {
                  showTab('streams');
                });
              }
            }
          }).text( streamname == 'new' ? 'cancel' : 'delete' )
        );
        
        $('#editserver').append(
          $('<button>').attr('class', 'floatright').click(function()
          {
            var n = $('#stream-edit-name');
            var s = $('#stream-edit-source');
            var p = $('#stream-edit-preset');
            var b = $('#stream-edit-buffer');
            var r = $('#stream-edit-record');
            
            if(n.val() == ''){ n.focus(); return; }
            if(s.val() == ''){ s.focus(); return; }
            if((b.val() != '') && ((b.val() < 0) || (isNaN(b.val())))){ b.focus(); return; }
            
            var newname = n.val().replace(/([^a-zA-Z0-9_])/g, '').toLowerCase();
            
            sdata.name = newname;
            sdata.source = s.val();
            sdata.preset.cmd = p.val();
            sdata.online = -1;
            sdata.error = null;
            sdata.record = r.val();
            if (b.val() != '') { sdata.DVR = b.val(); }
            sdata.contentkey = $('#stream-edit-contentkey').val();
            sdata.contentkey = $('#stream-edit-keyid').val();
            sdata.contentkey = $('#stream-edit-keyseed').val();
            
            if(streamname == 'new')
            {
              streamname = newname;
              sdata.sid = 0;
              for (strm in settings.settings.streams)
              {
                sdata.sid = Math.max(sdata.sid,settings.settings.streams[strm].sid); 
              }
              sdata.sid += 1;
            }
            else 
            {
              sdata.sid = settings.settings.streams[streamname].sid;
            }
            
            if(!settings.settings.streams)
            {
              settings.settings.streams = {};
            }
            
            delete settings.settings.streams[streamname];
            
            settings.settings.streams[newname] = sdata;
            
            loadSettings(function()
            {
              showTab('streams');
            });
              
          }).text('save')
        );
        
        $('#editserver').append(
          $('<span>').addClass('comment').text('* Case insensitive, no special characters allowed')
        );
        
        break;
        
      case 'embed':
        
        if(isThereAHTTPConnector())
        {
          var embedbase = 'http://' + parseURL(settings.server).host + ':' + getHTTPControllerPort() + '/';
          
          // TODO   .attr().html()   doesn't work... make this work in 2 lines again
          var iem = $('<p>').attr('class', 'nocapitals');
              iem.html('The info embed URL is <code>' + embedbase + 'info_' + streamname + '.js</code>');

          var eem = $('<p>').attr('class', 'nocapitals');
              eem.html('The embed embed URL is <code>' + embedbase + 'embed_' + streamname + '.js</code>');

          $('#page').append( iem );
          $('#page').append( eem );
          
          $('#page').append( $('<button>').text('preview').click(function()
          {
            showTab('preview', streamname);
          } ) );
          
        }else{
          $('#page').append( $('<p>').attr('class', 'nocapitals').text('Could\'t find a HTTP connector. Please add a HTTP connector on the "protocol" page.') );
        }
        
        break;
        
      case 'preview':
        
        var embed = 'http://' + parseURL(settings.server).host + ':' + getHTTPControllerPort() + '/embed_' + streamname + '.js';
        
        $('#page').append( $('<div>').attr('id', 'previewcontainer') );
        
        // jQuery doesn't work -> use DOM magic
        var script = document.createElement('script');
        script.src = embed;
        document.getElementById('previewcontainer').appendChild( script );
        
        break;
        
      case 'limits':
        /*if (settings.settings.LTS != 1) {
          $('#page').html('Limits are not supported in your version. Buy the LTS! :)');
          return;
        } */
        $cont = $('<span>').addClass('LTS-only');
        $('#page').append($cont);
      
        $table = $('<table>');
        $table.html("<thead><th>Hard/soft</th><th>Type</th><th>Value</th><th>Applies to</th><th>Action</th></thead>");
        $tbody = $('<tbody>');
        
        var i, tr, limit, stream, currentlims,
           alllimits = settings.settings.config.limits;
           
        for(stream in settings.settings.streams)
        {
          currentlims = settings.settings.streams[stream].limits;
          
          for (index in currentlims) {
            currentlims[index].appliesto = stream;
            currentlims[index].appliesi = index;
          }
          
          alllimits = alllimits.concat(currentlims);
        }
        
        len = alllimits.length;
        
        // remove old items
        $tbody.html('');
        
        //build current limits
        for(i = 0; i < len; i++)
        {
          limit = alllimits[i];
          $tbody.append(BuildLimitRow(limit));
        }
        for (stream in settings.settings.streams) {
          for (limit in settings.settings.streams[stream].limits) {
            delete settings.settings.streams[stream].limits[limit].appliesto;
            delete settings.settings.streams[stream].limits[limit].appliesi
          }
        }
         
        $table.append($tbody);
        $cont.append($table); 
        
        //tooltip
        $('.limits_type').live({
          "mouseover": function(e){
            removeTooltip();
            showTooltip(e,undefined,$(this).children(':selected').data('desc'));
          },
          "mouseout": function(){
            removeTooltip();
          }
        });
        $('.limits_name').live({
          "mouseover": function(e){
            removeTooltip();
            showTooltip(e,undefined,$(this).children(':selected').data('desc'));
          },
          "mouseout": function(){
            removeTooltip();
          }
        });
        
        //change limit value box on type change
        $('.limits_name').live("change", function(){
          var value = $(this).parents('.limits_row').find(".limits_val").val();
          $(this).parents('.limits_row').children('.limit_input_container').html('');
          BuildLimitRowInput(
           $(this).parents('.limits_row').children('.limit_input_container'),
           {
            'name': $(this).parents('.limits_row').find(".limits_name").val(),
            'type': $(this).parents('.limits_row').find(".limits_type").val(),
            'val': value
           }
          );
        });
        
        //build buttons
        $cont.append(
          $('<button>').text('Add limit').click(function(){
           $tbody.append(BuildLimitRow({"name":"kbps_max", "val":0, "type":"soft"}));
          })
        ).append($('<br>')).append(
          $('<button>').text('Save all').click(function(){
           //clear current limits
           settings.settings.config.limits = Array();
           for (str in settings.settings.streams) {
            settings.settings.streams[str].limits = Array();
           }
           
           //add new limits
           $tbody.children('tr').each(function(){
            var newval = null;
            switch ($(this).find(".limits_name").val()) {
              case 'geo':
                var entries = Array();
                $(this).find('.limit_listentry').each(function(){
                  var t = $(this).children(':selected').val();
                  if (t != ''){
                    entries.push(t);
                  }
                });
                newval = $(this).find('.limit_listtype').children(':selected').val() + entries.join(' ');
                break;
              case 'host':
              case 'time':
                var t = $(this).find('.limit_listentry').val();
                if ((t != undefined) && (t.toString().split(' ').length > 0)) {
                  newval = $(this).find('.limit_listtype').children(':selected').val() + t;
                }
                break;
              default:
                newval = $(this).find(".limits_val").val();
                break;
            }
            if (newval){
              obj = {"type": $(this).find(".limits_type").val(), "name":$(this).find(".limits_name").val(), "val":newval};
              if($(this).find('.new-limit-appliesto').val() == 'server') {
                settings.settings.config.limits.push(obj);
                //console.log('new server limit',obj);
              }else{
                settings.settings.streams[$(this).find('.new-limit-appliesto').val()].limits.push(obj);
                //console.log('new stream limit',$(this).find('.new-limit-appliesto').val(),obj);
              }
            }
           });
           loadSettings(function(){
            showTab('limits');
           });
          })
        );
        
        break;
        
      case 'conversion':
        
        var convs = settings.settings.conversion;
        if (!settings.settings.conversion.encoders) { settings.settings.conversion.encoders = 'get'; }
        
        $('#page').append(
          $('<p>').text('Current conversions:')
        );
        
        if (convs.status) {
          var tb = $('<tbody>');
          for (var i in convs.status) {
            var c = convs.status[i];
            var tr = $('<tr>').data('convertindex',i);
            tr.append(
              $('<td>').text(i)
            ).append(
              $('<td>').text(c)
            );
            /*
            tr.append(
              $('<td>').text(c.input)
            ).append(
              $('<td>').text(c.output)
            ).append(
              $('<td>').text(c.encoder)
            );
            var txt = 'No video';
            if (c.video) {
              if (c.video.codec) {
                txt = 'codec: '+c.video.codec;
              }
              else {
                txt = 'codec: current';
              }
              if (c.video.fpks) {
                //is it 1000 frames per sec or frames per 1000 sec?
                txt = txt+', fps: '+c.video.fpks+'000';
              }
              else {
                txt = txt+', fps: default';
              }
              if (c.video.width) {
                txt = txt+', size: '+c.video.width+' by '+c.video.height+'px';
              }
              else {
                txt = txt+', size: current';
              }
            }
            tr.append(
              $('<td>').text(txt)
            );
            var txt = 'No audio';
            if (c.audio) {
              if (c.audio.codec) {
                txt = 'codec: '+c.audio.codec;
              }
              else {
                txt = 'codec: current';
              }
              if (c.audio.samplerate) {
                txt = txt+', samplerate: '+c.audio.samplerate;
              }
              else {
                txt = txt+', samplerate: default';
              }
            }
            tr.append(
              $('<td>').text(txt)
            );
            */
            tb.append(tr);
          }
          /*
            $('<thead>').append(
              $('<tr>').append(
                $('<th>').text('Input file')
              ).append(
                $('<th>').text('Output file')
              ).append(
                $('<th>').text('Encoder')
              ).append(
                $('<th>').text('Video')
              ).append(
                $('<th>').text('Audio')
              )
            )
          */
          $('#page').append(
            $('<table>').append(
              $('<thead>').append(
                $('<tr>').append(
                  $('<th>').text('Name')
                ).append(
                  $('<th>').text('Status')
                )
              )
            ).append(tb)
          );
        }
        else {
          $('#page').append(
            $('<p>').text('None.')
          );
        }
        
        $('#page').append(
          $('<button>').text('Add').click(function(){
            loadSettings(function(){
              showTab('addconversion','new');
            });
          })
        ).append(
          ' '
        ).append(
          $('<button>').text('Clear all').click(function(){
            if(confirmDelete('Are you sure you want to clear all conversions?') == true) {
              convs.clear = true;
              loadSettings();
            }
          })
        );

        break;
      case 'addconversion':
        var c = settings.settings.conversion;
        var dir = settings.settings.config.basepath || './';
        
        $('#page').append(
            $('<label>').attr('for', 'conv-edit-query').text('Directory').append(
              $('<input>').addClass('nocapitals').attr('type', 'text').attr('id', 'conv-edit-query').attr('value',dir)
            )
        ).append(
          $('<input>').attr('type','hidden').attr('id','conv-edit-dir')
        ).append(
          $('<button>').text('search for input files').click(function(){
            conversionDirQuery($('#conv-edit-query').val());
          })
        ).append(
          $('<span>').attr('id','conversiondirquery-status')
        ).append(
          $('<div>').attr('id', 'editconversion')
        );
        
        
        $('#editconversion').append(
          $('<label>').attr('for', 'conv-edit-input').text('Input file').append(
            $('<select>').attr('id', 'conv-edit-input').addClass('nocapitals').width(237).change(function(){
              conversionSelectInput($(this).val());
            })
          )
        ).append(
          $('<label>').attr('for', 'conv-edit-output').text('Output file').append(
            $('<input>').attr('type', 'text').attr('id', 'conv-edit-output').addClass('nocapitals')
          )
        ).append(
          $('<label>').attr('for', 'conv-edit-encoder').text('Encoder').append(
            $('<select>').addClass('nocapitals').attr('id', 'conv-edit-encoder').width(237).change(function(){
              $('#conv-edit-video-codec').html(
                $('<option>').val('').text('-Current-')
              );
              for (i in settings.settings.conversion.encoders[$(this).val()].video) {
                $('#conv-edit-video-codec').append(
                  $('<option>').val(i).text(settings.settings.conversion.encoders[$(this).val()].video[i]+' ('+i+')')
                );
              }
              $('#conv-edit-audio-codec').html(
                $('<option>').val('').text('-Current-')
              );
              for (i in settings.settings.conversion.encoders[$(this).val()].audio) {
                $('#conv-edit-audio-codec').append(
                  $('<option>').val(i).text(settings.settings.conversion.encoders[$(this).val()].audio[i]+' ('+i+')')
                );
              }
            })
          )
        ).append(
          $('<label>').attr('for', 'conv-edit-video-codec').text('Video codec').append(
            $('<select>').addClass('nocapitals').attr('id', 'conv-edit-video-codec').width(237)
          )
        ).append(
          $('<label>').attr('for', 'conv-edit-video-fps').text('Video fps').append(
            $('<input>').attr('type', 'text').attr('placeholder', 'default').attr('id', 'conv-edit-video-fps')
          )
        ).append(
          $('<label>').attr('for', 'conv-edit-video-height').text('Video height*').append(
            $('<input>').attr('type', 'text').attr('placeholder', 'default').attr('id', 'conv-edit-video-height')
          )
        ).append(
          $('<label>').attr('for', 'conv-edit-video-width').text('Video width*').append(
            $('<input>').attr('type', 'text').attr('placeholder', 'default').attr('id', 'conv-edit-video-width')
          )
        ).append(
          $('<label>').attr('for', 'conv-edit-audio-codec').text('Audio codec').append(
            $('<select>').addClass('nocapitals').attr('id', 'conv-edit-audio-codec').width(237)
          )
        ).append(
          $('<label>').attr('for', 'conv-edit-audio-samplerate').text('Audio samplerate').append(
            $('<input>').attr('type', 'text').attr('placeholder', 'default').attr('id', 'conv-edit-audio-samplerate')
          )
        ).append(
          $('<span>').addClass('comment').text('*Fill in either the width or the height. Aspect ratio will be preserved.')
        );
        
        for (var i in c.encoders) {
          $('#conv-edit-encoder').append(
            $('<option>').val(i).text(i)
          );
        } 
        $('#conv-edit-video-codec').html(
          $('<option>').val('').text('-Current-')
        );
        for (i in c.encoders[$('#conv-edit-encoder').val()].video) {
          $('#conv-edit-video-codec').append(
            $('<option>').val(i).text(c.encoders[$('#conv-edit-encoder').val()].video[i]+' ('+i+')')
          );
        }
        $('#conv-edit-audio-codec').html(
          $('<option>').val('').text('-Current-')
        );
        for (i in c.encoders[$('#conv-edit-encoder').val()].audio) {
          $('#conv-edit-audio-codec').append(
            $('<option>').val(i).text(c.encoders[$('#conv-edit-encoder').val()].audio[i]+' ('+i+')')
          );
        }
        
        conversionDirQuery(dir);
        
        $('#page').append(
          $('<button>').text('Save').click(function(){
            var cobj = {}; //the object we will save
            
            cobj.input = $('#conv-edit-input').val();
            cobj.output =  $('#conv-edit-output').val();
            cobj.encoder =  $('#conv-edit-encoder').val();
            cobj.video = {};
            cobj.video.codec =  $('#conv-edit-video-codec').val();
            cobj.video.fpks =  $('#conv-edit-video-fps').val() * 1000;
            cobj.video.width =  $('#conv-edit-video-width').val();
            cobj.video.height =  $('#conv-edit-video-height').val();
            cobj.audio = {};
            cobj.audio.codec =  $('#conv-edit-audio-codec').val();
            cobj.audio.samplerate =  $('#conv-edit-audio-samplerate').val();
            
            for (i in cobj) {
              if ((cobj[i] == '') || (cobj[i] == 0)) { delete cobj[i]; }
            }
            for (i in cobj.video) {
              if ((cobj.video[i] == '') || (cobj.video[i] == 0)) { delete cobj.video[i]; }
            }
            for (i in cobj.audio) {
              if ((cobj.audio[i] == '') || (cobj.audio[i] == 0)) { delete cobj.audio[i]; }
            }
            
            if (!c.convert) { c.convert = {}; }
            objname = 'convert_'+cobj.output;
            while (c.convert[objname]) { objname += '_'; }
            c.convert[objname] = cobj;
            
            loadSettings(function(){
              showTab('conversion');
            });
          })
        ).append(' ').append(
          $('<button>').text('Cancel').click(function(){
            showTab('conversion');
          })
        );
          
        break;
        
      case 'logs':
        $('#page').append(
          $('<input>').attr('type','checkbox').addClass('logs_refresh')
        ).append(
          $('<span>').text(' Refresh logs every ')
        ).append(
          $('<select>').addClass('logs_refresh_every').append(
            $('<option>').val(10000).text('10 seconds')
          ).append(
            $('<option>').val(30000).text('30 seconds')
          ).append(
            $('<option>').val(60000).text('minute')
          ).append(
            $('<option>').val(300000).text('5 minutes')
          ).append(
            $('<option>').val(600000).text('10 minutes')
          ).append(
            $('<option>').val(1800000).text('30 minutes')
          )
        ).append(
          $('<button>').attr('class', 'floatright').click(function()
          {
            settings.settings.clearstatlogs = 1;
            loadSettings(function()
            {
              showTab('logs');
            });
          }).text('Purge logs')
        ).append(
          buildLogsTable()
        );
        
        $('.logs_refresh').change(function(){
          if ($(this).is(':checked')) {
            var delay = $('.logs_refresh_every').val();
            logsinterval = setInterval(function(){getLogsdata();},delay);
            getLogsdata();
          }
          else {
            clearInterval(logsinterval);
          }
        });
        $('.logs_refresh_every').change(function(){
          if ($('.logs_refresh').is(':checked')) {
            var delay = $(this).val();
            clearInterval(logsinterval);
            logsinterval = setInterval(function(){getLogsdata();},delay);
          }
        });
        
        break;
        
      case 'server stats':
        loadSettings(function(){
          serverstats = settings.settings.capabilities;
          
          if (serverstats.cpu !== undefined) 
          {
            $('#page').append(
              $('<div>').attr('class','datacont').append(
                $('<p>').text('CPU')
              )
            );
            //be careful, only works if this is the first div to be constructed
            for (property in serverstats.cpu[0]) 
            {
              $('#page div.datacont').append(
                $('<label>').text(property).append(
                  $('<span>').text(serverstats.cpu[0][property])
                )
              );
            }
          }
          if (serverstats.mem !== undefined) 
          {
            $('#page').append(
              $('<div>').attr('class','datacont').append(
                $('<p>').text('Memory')
              ).append(
                $('<label>').text('Physical memory').append(
                  $('<span>').text(serverstats.mem.used+'MiB/'+serverstats.mem.total+'MiB ('+serverstats.mem.free+'MiB available)')
                )
              ).append(
                $('<label>').text('Swap memory').append(
                  $('<span>').text((serverstats.mem.swaptotal - serverstats.mem.swapfree)+'MiB/'+serverstats.mem.swaptotal+'MiB ('+serverstats.mem.swapfree+'MiB available)')
                )
              )								
            );
          }
          if (serverstats.load !== undefined) 
          {
            $('#page').append(
              $('<div>').attr('class','datacont').append(
                $('<p>').text('Load')
              ).append(
                $('<label>').text('Memory used').append(
                  $('<span>').text(serverstats.load.memory+'%')
                )
              ).append(
                $('<label>').text('Loading averages').append(
                  $('<span>').text('1 min: '+serverstats.load.one+'%, 5 min: '+serverstats.load.five+'%, 15 min: '+serverstats.load.fifteen+'%')
                )
              )
            );
          }
        });
        
        break;
      case 'Mist Shop':
        $('#page').append($('<p>').addClass('nocapitals').text('The Mist Shop has been opened in a new tab.'));
        break;
      case 'disconnect':
        showTab('login');
        setHeaderState('disconnected');
        $('#nav').css('visibility', 'hidden');
        
        settings =
        {
          server: '',
          credentials:
          {
            username: "",
            password: "",
            authstring: ""
          },
          settings: {}
        };
        break;
    }  // end switch
    
    //placeholder for older browsers
    $('input[placeholder]').placeholder();
    
    if (settings.settings.LTS != 1) {
      $('.LTS-only input').add('.LTS-only select').add('.LTS-only button').attr('disabled','disabled');
      
      $('.LTS-only').children().each(function(){
        var t = $(this).attr('title');
        if (t) { t += ' '; }
        else { t = ''; }
        t += 'This is feature is only available in the LTS version.';
        $(this).attr('title',t);
      });
      /*
      $('.LTS-only').hover(function(e){
        removeTooltip();
        showTooltip(e,undefined,'This is feature is only available in the LTS version.');
      },function(){
        removeTooltip();
      });
      */
      
      $('.LTS-only').add('.LTS-only p').add('.LTS-only label').add('.LTS-only button').css('color','#b4b4b4');
    }
  }


