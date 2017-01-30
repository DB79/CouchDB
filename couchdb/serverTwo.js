//import modules useed in file
var express  = require('express'),
    path     = require('path'),
    bodyParser = require('body-parser'),
    app = express(),
    expressValidator = require('express-validator'),
    cradle = require('cradle');

//set up of some additional features
app.set('views','./views');
app.set('view engine','ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true })); 
app.use(bodyParser.json());
app.use(expressValidator());

//define database name and port that server will run on.
var dbName = "playersrepl";
var targetOfReplication = "players";
var port = 3001;

//created connections to database
var db = new(cradle.Connection)().database(); 
var c = new(cradle.Connection);
var db = c.database(dbName);


//checks to see that database is created, if not it will be created along with views
db.exists((err, exists)=>{
    if (err) {
      console.log('There wsa an error connecting, please ensure couch db is running', err);
    } 
    else if (exists) 
    {
      console.log(dbName + ' already exists');
    } 
    else {
      //if the db doesn't exist it will be created as well as the design documents 
      console.log( dbName + ' does not exists and has been created');
      db.create();
    }
});

//RESTful route
var router = express.Router();

router.use((req, res, next)=>{
    next();
});

var userRoute = router.route('/user');

//GET all players using allWithTrophies
userRoute.get((req,res,next)=>{

    //use allWithTrophies view with group and reduce to get number of trophies each player has
    db.view('viewAll/allWithTrophies',{group: true, reduce: true}  , (err, result)=>{
        var people =[]; 

        if(typeof result == 'undefined' ){
            //send 0 in data field as no data was found in db
            res.render('user',{title:"Player Data",data:0});
        }

       else{
            //iterate through each result to get data 
            result.forEach((key, value, id)=>{

                //if the players have no trophy an object is returned as the value. 
                //update value to be 0 rather than object.
                if(typeof value == "object"){
                    value = value["value"];
                }

                //create a new person and a the person to people array
                var person = {id: key["id"], username: key["username"], level: key["level"], trophies: value }
                people.push(person);  
 
            });
            //return people array to page so that each person can be displayed on screen
            res.render('user',{title:"Players Data",data:people}); 
       }
    });
    

});

//post data to DB | POST
userRoute.post((req,res,next)=>{

    //validation
    req.assert('username','Userame is required').notEmpty();

    var errors = req.validationErrors();
    if(errors){
        res.status(422).json(errors);
        return;
    }

    db.save(req.body,(err, result) => {
        if (err) return console.log(err)
        res.redirect('/api/user');
    });
 });

//replicate data from players to playersrepl
var replRoute = router.route('/replicate');

replRoute.post((req,res)=>{

    console.log('In replication method')
    db.replicate(targetOfReplication,'');
    res.redirect('/api/user');
   
 });

//new route which takes document id
var userRouteID = router.route('/user/:user_id');

userRouteID.all((req,res,next)=>{
     next();
});

//global person used to display info of player being updated and the updated person json object is sent to db after updates
var person;

//get data to update
userRouteID.get((req,res,next)=>{

    var _id = req.params.user_id;

    db.get(_id,(err, doc)=>{
        //set global person to be doc json object returned from db
        person = doc;
        res.render('edit',{title:"Edit user",data:person}); 
    });

});

//updates data of a user
userRouteID.put((req,res,next)=>{

    var _id = req.params.user_id;
    console.log('Updating document with _id: ' + _id);

    //validation to ensure username still has a value and level is an int
    req.assert('username','Username is required').notEmpty();
    req.assert('level','Level mumst be a number').isInt();

    //if error return error messgae to screen
    var errors = req.validationErrors();
    if(errors){
        res.status(422).json(errors);
        return;
    }

    //if a new value has been added, the value needs to be pushed to the existing person.trophy array
    //otherwise the array remains the same
    if(req.body.trophy != ""){

        //create new trophy object to hold trophy name and date earned
        var trophyName = req.body.trophy;
        var trophy = {
            name:trophyName,
            earned: new Date().toJSON().slice(0,10)
        }

        //if the player has no existing trophies array field needs to be added to person object
        if(typeof person.trophy == "undefined"){
            person.trophy = [];
            person.trophy.push(trophy);
        }
        //if the player already has trophies then just push the new trophy to the array
        else{
            person.trophy.push(trophy);
        }
    }

    //if the person has no trophies, then just update other fields to new values
    if(typeof person.trophy == "undefined"){
        person ={
            id: req.body.id, username: req.body.username, level: req.body.level, team: req.body.team
        }
    }//if they have trophies, set trophy to be person.trophy as this has the new trophy add to it
    else{
        person = {
            id: req.body.id, username: req.body.username, level: req.body.level, team: req.body.team, trophy: person.trophy
        }
    }

    //update document with the updated person data
    db.merge(_id, person,(err, result) => {
            if(err)return console.log(err)
            
            res.sendStatus(200);
    })
});

//delete data
userRouteID.delete((req,res,next)=>{

    var _id = req.params.user_id;

    //remove document with _id = user_id
    db.remove(_id, (err, res)=>{
      if(err) return console.log(err)

      console.log('Removing document with _id ' + _id);

    });
    
    res.sendStatus(200);
});

//now we need to apply our router here
app.use('/api', router);

var server = app.listen(port,function(){
   console.log("Listening to port %s",server.address().port);
});


