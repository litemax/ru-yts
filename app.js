var express = require('express'),
    credential = require(process.env.DEV ? './secret' : './credential'),
    config = require('./config'),
    mongoose = require('mongoose'),
    itemModel = require('./models/Item'),
    Logme = require('logme').Logme,
    fs = require('fs'),
    path = require('path'),
    morgan = require('morgan');

var later = require('later'),
    worker = require('./worker');

later.date.localTime();
for (var i in config.tasks) {
    if (config.tasks.hasOwnProperty(i)) {
        var task = config.tasks[i];
        var scheduler = later.parse.cron(task.cron, true);
        later.setInterval(worker.start.bind(this, task.total, task.category), scheduler);
    }
}

var app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
var hour = 3600000,
    day = hour * 24,
    week = day * 7;
app.use(express['static'](path.join(__dirname, 'public'), {
    maxAge: week
}));
app.use(function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

var logFile = fs.createWriteStream(__dirname + '/log.txt', {
        flags: 'a'
    }),
    logger = new Logme({
        stream: logFile,
        theme: 'clean'
    });

app.use(morgan('combined', {
    stream: logFile
}));

mongoose.connect(credential.db);

var genreKeywords = function(keywords) {
    return (function(keywords) {
        var string = '';
        keywords.forEach(function(keyword) {
            string += '(?=.*' + keyword + '.*)';
        });
        return string;
    }(keywords.split('% '))).replace(/(е|ё)/i, '(е|ё)');
};

var templateRecord = function(item) {
    var info = item.info;
    return {
        'Quality': info.quality,
        'CoverImage': info.cover,
        'ImdbCode': item.guid,
        'TorrentPeers': info.leechers,
        'TorrentSeeds': info.seeders,
        'TorrentUrl': info.magnet,
        'TorrentMagnetUrl': info.magnet,
        'SizeByte': info.size + '',
        'Size': (info.size ? parseInt(info.size / 1024 / 1024, 10) : 'None') + ' Mb',
        'MovieTitleClean': item.title,
        'MovieYear': info.year,
        'Genre': info.genre,
        'MovieRating': info.rating
    };
};

app.get('/', function(req, res) {
    itemModel.count({}, function(error, count) {
        if (error) {
            return logger.error(error);
        }
        return res.render('index', {
            count: count
        });
    });
});

app.get('/api/list.json', function(req, res) {
    var params = req.query,
        limit = params.limit || 20,
        page = params.set || 1,
        genre = params.genre || 'All',
        keywords = params.keywords || false,
        filter = genre === 'All' ? {} : {
            'info.genre': new RegExp(config.genres[genre], 'i')
        },
        sort = {};

    if (keywords) {
        keywords = new RegExp(genreKeywords(keywords), 'i');
        filter.title = keywords;
    }

    if (params.sort) {
        switch (params.sort) {
            case 'year':
                params.sort = 'info.year';
                break;
            case 'alphabet':
                params.sort = 'title';
                break;
            case 'date':
                params.sort = 'info.date';
                break;
            default:
                params.sort = 'info.date';
                break;
        }
        if (params.sort) {
            sort[params.sort] = params.order === 'desc' ? -1 : 1;
        }
    }

    return itemModel.find(filter, null, {
            skip: limit * (page - 1),
            limit: limit,
            sort: sort
        },
        function(error, items) {
            if (error) {
                return logger.error(error);
            }

            var list = [],
                i = null;
            for (i = 0; i < items.length; i++) {
                var item = items[i];
                list.push(templateRecord(item));
            }

            return res.json({
                'MovieCount': items.length,
                'MovieList': list
            });
        });
});

app.get('/api/listimdb.json', function(req, res) {
    var params = req.query;
    return itemModel.find({
        'guid': params.imdb_id
    }, function(error, items) {
        if (error) {
            return logger.error(error);
        }

        var list = [],
            i = null;
        for (i = 0; i < items.length; i++) {
            var item = items[i];
            list.push(templateRecord(item));
        }

        return res.json({
            'MovieCount': items.length,
            'MovieList': list
        });
    });
});

var server = app.listen(3000, function() {
    console.log('Listening on port %d', server.address().port);
});