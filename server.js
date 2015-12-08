var ini = require('ini');
var fs = require('fs');
var config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));
var WebSocketServer = require('ws').Server
  , wss = new WebSocketServer({ host: config.websocket.host, port: config.websocket.port });
var sql = require('mssql');
var net = require('net');
var diocoll = new net.Socket();
//var binary = require('binary');
var mod_ctype = require('ctype');

//console.log(config.database);
var dbconfig = {
    user: config.database.user,
    password: config.database.password,
    server: config.database.server,
    port: config.database.port,
    database: config.database.database,
    options: {
        encrpt: true
    }
};

var mssqldb = sql.connect(dbconfig, function (err) {
    // ... error checks 
    if (err)
        console.log('mssqldb err');
    else {
        console.log('mssqldb connection success!');

        if (config.appsetting.simulate == '0') {
            console.log('simulate mode');

            // simulate diocoll send
            setInterval(function () {
                var eventno = "77146";
                getEventInfo(eventno, function (rs) {
                    wss.broadcast(rs);
                });
            }, 5000);
        }

    }
});

mssqldb.on('error', function (err) {
    // ... error handler 
});

wss.broadcast = function broadcast(data) {
    wss.clients.forEach(function each(client) {
        // console.log(client);
        console.log("broadcast ");
        client.send(JSON.stringify(data));
    });
};

wss.on('connection', function connection(ws) {
    ws.on('message', function incoming(message) {
        //var msg = JSON.parse(message);
        console.log('received: %s', JSON.stringify(message));

        wss.broadcast(message);
    });

    //ws.send('something');

});


diocoll.connect(config.diocoll.port, config.diocoll.host, function () {
    console.log('dio tray Connected');
    //client.write('Hello, server! Love, Client.');
});

diocoll.on('data', function (data) {
    var eventno;
    var parser = new mod_ctype.Parser({ endian: 'little' });

    parser.typedef('CDIOTrayInfo', [
	{ nInfoSize: { type: 'int32_t' } },
	{ szTime: { type: 'char[24]' } },
	{ szIP: { type: 'char[64]' } },
	{ nPort: { type: 'int32_t' } },
	{ nDIO: { type: 'int32_t' } },
	{ nAlarmType: { type: 'int32_t' } },
	{ nDIOID: { type: 'char[32]' } },
	{ nBureauID: { type: 'char[8]' } },
	{ DVSName: { type: 'char[64]' } },
	{ Location: { type: 'char[64]' } },
	{ LoginID: { type: 'char[64]' } }
    ]);

    var out = parser.readData([{ event: { type: 'CDIOTrayInfo' } }], data, 0);
    //console.dir(out.event.toString());
    if (out.event.nAlarmType == 1) {
        eventno = out.event.nDIOID.toString().trim();        
        console.log("receive diocoll eventid " + eventno);

        // Query 
        getEventInfo(eventno, function (rs) {
            wss.broadcast(rs);
        });

        client.write("ACK");
    }

    //client.destroy(); // kill client after server's response
});

diocoll.on('error', function () {
    console.log('diocoll connection fail');
});

diocoll.on('close', function () {
    console.log('Connection closed');
});

function getEventInfo(eventno, successCallback) {
    var sqlstring = " select w.deviceid, w.no, CONVERT(varchar(100), w.EventTime, 20) as time, ISNULL(r.Val, wid.EventName) as name, w.eventid from wevent w ";
    sqlstring += " join weventid wid on wid.EventID = w.EventID ";
    sqlstring += " left join WEventIDResx r on wid.EventID=r.EventID and r.ColName='EventName' and r.LangID='zh-Hant' ";
    sqlstring += " where w.eventid in ('C008', 'C007', 'H001','H002') and w.devicetype='03' and w.no = '" + parseInt(eventno) + "' ";
    //console.log(sqlstring);
    console.log("query db eventinfo where eventid = " + eventno);

    var request = new sql.Request();
    request.query(sqlstring, function (err, recordset) {
        // ... error checks 
        if (err) {
            console.log('err:%s', err);
            return;
        }

        console.dir(recordset);
        if (recordset.length != 0)
            successCallback(recordset);
    });
}