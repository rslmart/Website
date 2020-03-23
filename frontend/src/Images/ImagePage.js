import React, { Component } from "react";
import {
    Container,
    Dropdown,
    Form,
    Loader,
    Image,
    Placeholder
} from 'semantic-ui-react';
import {
    DateInput,
    TimeInput,
    DateTimeInput
} from 'semantic-ui-calendar-react';

class ImagePage extends Component {
    // API_GATEWAY_ENDPOINT = "http://192.168.0.184:5000";
    API_GATEWAY_ENDPOINT = "http://127.0.0.1:5000/";

    keys = ['season', 'basin', 'storm_number', 'storm_agency', 'storm_name', 'type', 'sensor', 'resolution',
        'image_url', 'year', 'month', 'day', 'hour', 'minute', 'second', 'satellite', 'extension'];

    startingResponse = {
        beginDate:"1997-06-20 09:31",
        endDate: "2019-12-30 12:40",
        options: {
            season:[1997,1998,1999,2000,2001,2002,2003,2004,2005,2006,2007,2008,2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019],
            basin: ["ATL","CPAC","EPAC","IO","SHEM","WPAC"],
            storm_name:["ABAIMBA","ABELA","ABELE","ABIGAIL","ADELINE","ADJALI","ADOLPH","ADRIAN","AERE","AGATHA","AGNI","AILA","AKASH","AKONI","ALAN","ALBERTO","ALCIDE","ALDA","ALENGA","ALESSIA","ALETTA","ALEX","ALFRED","ALIKA","ALISON","ALISTAIR","ALLISON","ALMA","ALPHA","ALVIN","AMANDA","AMARA","AMBER","AMI","AMOS","AMPIL","ANA","ANACELLE","ANAIS","ANDO","ANDREA","ANDRES","ANGGREK","ANIKA","ANITA","ANJA","ANN","ANNABELLE","ANTHONY","ARLENE","AROLA","ARTHUR","ASHOBAA","ASMA","ASTRIDE","ATANG","ATSANI","ATU","AVA","BAAZ","BABIOLA","BABS","BAILU","BAKUNG","BANDU","BANSI","BANYAN","BARBARA","BARIJAT","BARRY","BART","BAVI","BEATRIZ","BEBINCA","BECKY","BEJISA","BELTANE","BENI","BENILDE","BENTO","BERGUITTA","BERNARD","BERNIE","BERTHA","BERTIE","BERYL","BESSI","BETA","BIANCA","BIJLI","BILIS","BILL","BILLY","BINDU","BINGIZA","BLANCA","BLANCHE","BLAS","BOHALE","BOLAVEN","BOLDWIN","BOLOETSE","BONDO","BONGANI","BONGWE","BONNIE","BOPHA","BORIS","BOUCHRA","BOURA","BRET","BRUCE","BUALOI","BUD","BUNE","CALEB","CALVIN","CAM","CARINA","CARLOS","CARLOTTA","CASS","CATHY","CEBILE","CELA","CELIA","CELINA","CHABA","CHAMBO","CHAMPI","CHAN-HOM","CHANCHU","CHANDA","CHANTAL","CHANTHU","CHAPALA","CHARLEY","CHARLOTTE","CHARLY","CHATAAN","CHEBI","CHEDZA","CHERONO","CHIKITA","CHIP","CHOI-WAN","CHRIS","CHRISTINE","CILIDA","CILLA","CIMARON","CINDA","CINDY","CLARE","CLAUDETTE","CLAUDIA","CLEO","CLIFF","CLOVIS","COLIN","CONNIE","CONSON","COOK","CORA","CORENTIN","COSME","CRAIG","CRISTINA","CRISTOBAL","CRYSTAL","CYPRIEN","CYRIL","DAHLIA","DALILA","DAMA","DAMAN","DAMIEN","DAMIENNE","DAMREY","DAN","DANAS","DANI","DANIEL","DANIELLE","DANNY","DAPHNE","DARBY","DAREN","DARIUS","DARYL","DAVID","DAVINA","DAWN","DAYA","DEAN","DEBBIE","DEBBY","DELFINA","DELIWE","DELTA","DENNIS","DERA","DES","DESMOND","DIAMONDRA","DIANMU","DIANNE","DINA","DINEO","DIWA","DOKSURI","DOLLY","DOLORES","DOLPHIN","DOMINIC","DON","DONALINE","DONGO","DONNA","DORA","DORIAN","DOUGLAS","DOVI","DUJUAN","DUMAZILE","DUMILE","DURGA","DURIAN","DYLAN","DYNAMO","EARL","EBULA","EDDY","EDILSON","EDNA","EDOUARD","EDZANI","EIGHT","EIGHTEEN","ELA","ELAINE","ELE","ELEVEN","ELIA","ELIAKIM","ELIDA","ELISA","ELITA","ELLA","ELLIE","ELNUS","ELSIE","ELVIS","EMA","EMANG","EMERAUDE","EMILIA","EMILY","EMMA","ENAWO","ENOK","ENRIQUE","EPSILON","ERIC","ERICA","ERICK","ERIKA","ERIN","ERNEST","ERNESTO","ERNIE","ERROL","ESETA","ESTELLE","ETAU","ETHEL","EUGENE","EUNICE","EVAN","EVARISTE","EVE","EWINIAR","FABIAN","FABIO","FAITH","FAKIR","FAME","FAMI","FANAPI","FANELE","FANI","FANOOS","FANTALA","FARI","FAUSTO","FAVIO","FAXAI","FAY","FEHI","FELICIA","FELIX","FELLENG","FENGSHEN","FERNAND","FERNANDA","FERNANDO","FIFTEEN","FIONA","FITOW","FIVE","FLAMBOYAN","FLORENCE","FLOSSIE","FLOYD","FOBANE","FOUR","FOURTEEN","FRANCES","FRANCESCA","FRANCISCO","FRANK","FRANKLIN","FRED","FREDA","FREDDY","FREDERIC","FRITZ","FUNA","FUNANI","FUNDI","FUNG-WONG","FUNSO","GABRIELLE","GAEL","GAEMI","GAFILO","GAJA","GAMEDE","GAMMA","GARRY","GASTON","GELANE","GELENA","GEMMA","GENE","GENEVIEVE","GEORGE","GEORGES","GEORGETTE","GERARD","GERRY","GERT","GIL","GILL","GILLIAN","GILMA","GINA","GINGER","GINO","GIOVANNA","GIRI","GITA","GLENDA","GLORIA","GONI","GONU","GONZALO","GORDON","GRACE","GRAHAM","GRANT","GREG","GUBA","GUCHOL","GUILLAUME","GUILLERMO","GUITO","GULA","GUSTAV","GWENDA","HADI","HAGIBIS","HAGUPIT","HAIKUI","HAIMA","HAISHEN","HAITANG","HAIYAN","HALEH","HALEY","HALI","HALIBA","HALOLA","HALONG","HAMISH","HANK","HANNA","HAPE","HARRIET","HARUNA","HARVEY","HARY","HATO","HECTOR","HEIDI","HELEN","HELENE","HELLEN","HENNIE","HENRI","HENRIETTE","HERMINE","HERNAN","HETA","HETTIE","HIGOS","HIKAA","HILARY","HILDA","HILWA","HINA","HOLA","HONDO","HOWARD","HUBERT","HUDAH","HUDHUD","HUKO","HUMBA","HUMBERTO","IAN","IDA","IDAI","IGGY","IGNACIO","IGOR","IKALA","IKE","IKOLA","ILEANA","ILSA","IMANI","IMBUDO","IMELDA","IN-FA","INDLALA","INGRID","INIGO","INNIS","INNOCENTE","INVEST","IOKE","IRENE","IRINA","IRIS","IRMA","IRVING","IRWIN","ISAAC","ISABEL","ISANG","ISELLE","ISHA","ISIDORE","ISIS","ISOBEL","ITA","ITOP001","ITOP002","ITOP003","ITOP004","ITOP005","ITOP006","ITOP007","ITOP008","ITOP009","ITOP010","ITOP011","ITOP012","ITOP013","ITOP014","ITOP015","ITOP016","ITOP017","ITOP018","ITOP019","ITOP020","ITOP021","ITOP022","ITOP023","ITOP024","ITOP025","ITOP026","ITOP027","ITOP028","ITOP029","ITOP030","ITOP031","ITOP033","IUNE","IVAN","IVANOE","IVETTE","IVO","IVY","IZILDA","JACK","JACOB","JADE","JAL","JAMALA","JANA","JANGMI","JAPHET","JASMINE","JASPER","JAVIER","JAYA","JEANNE","JEBI","JELAWAT","JERRY","JIM","JIMENA","JO","JOALANE","JOAN","JOANINHA","JOAQUIN","JOHN","JOKWE","JONGDARI","JONI","JOSE","JOSEPHINE","JOSIE","JOVA","JOYCE","JUAN","JUBA","JULIA","JULIETTE","JULIO","JUNE","KAEMI","KAI-TAK","KAJIKI","KALMAEGI","KALUNDE","KAMBA","KAMMURI","KARA","KAREN","KARINA","KARL","KATE","KATIA","KATRINA","KAY","KEILA","KEITH","KELVIN","KEN","KENANGA","KENI","KENNA","KENNETH","KERRY","KESINY","KETSANA","KEVIN","KHAI-MUK","KHANUN","KIKA","KIKO","KILO","KIM","KIRK","KIROGI","KIRRILY","KOFI","KOJI","KOMEN","KOMPASU","KONG-REY","KONI","KOPPU","KRISTY","KROSA","KROVANH","KUENA","KUJIRA","KULAP","KYANT","KYARR","KYLE","LAILA","LAM","LAN","LANA","LANE","LARRY","LAURA","LAURENCE","LEE","LEEPI","LEHAR","LEKIMA","LENNY","LEO","LEONELINE","LES","LESLIE","LESTER","LIDIA","LILI","LIN","LINDA","LINFA","LINGLING","LIONROCK","LISA","LIUA","LOKE","LOLA","LONGWANG","LORENA","LORENZO","LORNA","LOWELL","LUA","LUBAN","LUPIT","LUSI","MA-ON","MAARUTHA","MADELINE","MADI","MAEMI","MAGDA","MAGGIE","MAHA","MAHASEN","MAKA","MALA","MALAKAS","MALIA","MALIKSI","MALOU","MAN-YI","MANGKHUT","MANOU","MANUEL","MARCIA","MARCO","MARCUS","MARIA","MARIE","MARIO","MARTIN","MARTY","MATMO","MATSA","MATTHEW","MAWAR","MAX","MAY","MAYSAK","MEARI","MEENA","MEGH","MEGI","MEKKHALA","MEKUNU","MELANIE","MELISSA","MELOR","MERANTI","MERBOK","MICHAEL","MICHELLE","MICK","MIKE","MINDULLE","MINDY","MIRIAM","MIRINAE","MITAG","MITCH","MITCHELL","MOLAVE","MONA","MONICA","MONTY","MORA","MORAKOT","MORT","MUIFA","MUJIGAE","MUKDA","MUN","MURJAN","NABI","NADA","NADINE","NAKRI","NALGAE","NAMTHEUN","NANA","NANAUK","NANCY","NANGKA","NANMADOL","NARDA","NARELLE","NARGIS","NARI","NATE","NATHAN","NEIL","NEKI","NELSON","NEOGURI","NEPARTAK","NESAT","NESTOR","NEWTEST","NEWTON","NIALA","NICHOLAS","NICHOLE","NICKY","NICOLE","NIDA","NIKO","NILAM","NILOFAR","NINE","NINETEEN","NISHA","NOCK-TEN","NOEL","NOGURI","NONAME","NORA","NORBERT","NORMA","NORMAN","NORU","NOUL","NRLINVEST","NRLMRY","NRLTES","NURI","NUTE","OCKHI","OCTAVE","ODETTE","ODILE","OHO","OLA","OLAF","OLGA","OLI","OLINDA","OLIVIA","OLIWA","OLWYN","OMA","OMAIS","OMAR","OMEKA","ONE","OPAL","OPHELIA","ORLENE","OSCAR","OSCAR-ITSE","OSEA","OSWALD","OTIS","OTTO","OWEN","PABLO","PABUK","PAINE","PAKA","PAKHAR","PALI","PALOMA","PAM","PANCHO","PARMA","PAT","PATRICIA","PATTY","PAUL","PAULA","PAULINE","PAWAN","PEIPAH","PENNY","PERCY","PETA","PETE","PETER","PEWA","PGI25L","PGI26L","PGI27L","PGI28L","PGI29L","PGI30L","PGI31L","PGI32L","PGI33L","PGI34L","PGI35L","PGI36L","PGI37L","PGI38L","PGI39L","PGI40L","PGI41L","PGI42L","PGI43L","PGI44L","PGI45L","PGI46L","PGI47L","PGI48L","PGI49L","PGI50L","PGI51L","PGI54L","PGI55L","PGI57L","PGI58L","PGI59L","PGI60L","PGI61L","PGI62L","PGI63L","PGI64L","PGI65L","PGI66L","PGI67L","PGI68L","PHAILIN","PHANFONE","PHET","PHETHAI","PHILIPPE","PHOEBE","PHYAN","PIERRE","PILAR","PODUL","POLA","POLO","PONGSONA","PRAPIROON","PRISCILLA","QUANG","RACHEL","RAE","RAFAEL","RAI","RAMMASUN","RAMON","RANANIM","RAQUEL","RASHMI","RAYMOND","REBEKAH","REMNANTS","RENE","REUBEN","REX","RICHARD","RICK","RILEY","RINA","RITA","ROANU","ROBYN","ROKE","RON","ROSA","ROSIE","ROSITA","ROSLYN","RUMBIA","RUSA","RUSTY","SAGAR","SALLY","SAM","SANBA","SANDRA","SANDY","SANVU","SAOLA","SAOMAI","SARAH","SARIKA","SAVANNAH","SCOTT","SEAN","SEBASTIEN","SELMA","SELWYN","SEPAT","SERGIO","SEVEN","SEVENTEEN","SEYMOUR","SHANSHAN","SHARY","SID","SIDR","SIMON","SINLAKU","SIX","SIXTEEN","SOLO","SON-TINH","SONAMU","SONCA","SONGDA","SONIA","SOSE","SOUDELOR","SOULIK","STAN","STELLA","STEVE","STORM","SUDAL","SUSAN","TALAS","TALIM","TAM","TAMMY","TANYA","TAPAH","TARA","TASHA","TATIANA","TCS025","TCS106","TCSP-CENTRAL","TCSP-EAST","TCSP-WEST","TD","TEMBIN","TEN","TERRI","TESSI","THANE","THELMA","THIRTEEN","THIRTY","THIRTYFIVE","THIRTYTHRE","THREE","TIFFANY","TIM","TINA","TINGTING","TITLI","TODD","TOKAGE","TOMAS","TONY","TORAJI","TRAMI","TREVOR","TRINA","TRUDY","TUNI","TWELVE","TWENTY","TWENTY-ONE","TWENTYEIGH","TWENTYEIGHT","TWENTYFIVE","TWENTYFOUR","TWENTYNINE","TWENTYONE","TWENTYSEVE","TWENTYSEVEN","TWENTYSIX","TWENTYTHRE","TWENTYTWO","TWO","ULA","ULIKA","ULUI","UNALA","UPANA","UPIA","URIAH","URMIL","URSULA","USAGI","UTOR","VAIANU","VAMCO","VAMEI","VANCE","VANIA","VARDAH","VAUGHAN","VAYU","VELI","VERONICA","VICENTE","VICKI","VICTOR","VICTORIA","VINCE","VINCENT","VIPA","VIRGIL","VIVIENNE","VONGFONG","WAKA","WALAKA","WALDO","WALI","WALLACE","WALTER","WARD","WASHI","WATI","WENDY","WENE","WES","WILLA","WILLY","WILMA","WINNIE","WINSOME","WINSTON","WIPHA","WUKONG","WUTIP","XANGSANE","XAVIER","YAGI","YALI","YALO","YANI","YANNI","YANYAN","YASI","YOLANDE","YORK","YULE","YUTU","YVETTE","ZAKA","ZANE","ZEB","ZELIA","ZENA","ZETA","ZIA","ZITA","ZOE","ZUMAN"],
            type:["amsre","amsu","amsub","atms","gmi","ir","seviri","smap","ssmi","tmi","tpw","vapor","vis","windbarbs","windsat"],
            sensor:["165","183","1km","1km_bw","23","36h","36pct","36v","3785","37h","37hlg","37pct","37pctlg","37v","37vlg","6GHz_37h","6GHz_wind","6ghz_37h","6ghz_wind","85h","85h_1deg","85h_new","85hw","85pct","88","88hw","89","89_1deg","89h","89h_1deg","89hw","89rgb","89v","ahi","archer","ascat","cldWater","cloud","cloud_water","color","color36","color37","color37pct_combo","color_1deg","color_89_150","colorpct37","colorpct37lg","colorpct85","colorpct_85h_85v","colorpct_85h_85v_1deg","colorpct_89h_89v","colorpct_89h_89v_1deg","colorpct_combo","composite","gac","geo","geoir","geoir2","geosatir","geovis","gmsir","gmsir2","gmsvis","goesir","goesir2","goesvis","gvar","latest1km","microvap","microvap_modvap","microvap_modwind","modis","nrcs","ols","ols_color","ols_color_sqrt","olsir_images","olsvisible_images","olsvisible_images_sqrt","oscat","pct","precipIce","rain","rrate","scat","scat_ambiguity","scat_coaps","scat_over_85h","scat_over_colorpct","scat_over_colorpct_amb","seviri","sst","surfaceRain","surfaceRain2","tmi_37h","tmi_37v","tmi_85h","tmi_85h_1deg","tmi_85v","uwave_scat","vapor","vapor_500_300_mb","vapor_sfc_700_mb","viirs","vis1km_high","vlrsst","wind","wind1","wind_barbs","windsat","windsat_winds","wsat_over_85H","wsat_over_85h","wsat_over_colorpct"],
            resolution:["0p25km","0p75","0p75km","1degreeticks","1km","1km2","1km_BD","1km_bw","1km_zoom","1kmcolor","1p00km","1p0km","2degreeticks","2km","500_300_mb","FNMOC_25KM_AMB_85H","FNMOC_25KM_AMB_COLOR37","FNMOC_25KM_AMB_COLORPCT","FNMOC_25KM_AMB_IR","FNMOC_25KM_AMB_NONE","FNMOC_25KM_AMB_VIS","FNMOC_25KM_PRIM_85H","FNMOC_25KM_PRIM_COLOR37","FNMOC_25KM_PRIM_COLORPCT","FNMOC_25KM_PRIM_IR","FNMOC_25KM_PRIM_NONE","FNMOC_25KM_PRIM_VIS","NESDIS_25KM_AMB_IR","NESDIS_25KM_AMB_NONE","NESDIS_25KM_AMB_VIS","NESDIS_25KM_PRIM_IR","NESDIS_25KM_PRIM_NONE","NESDIS_25KM_PRIM_VIS","NESDIS_HIRES_AMB_IR","NESDIS_HIRES_AMB_NONE","NESDIS_HIRES_AMB_VIS","NESDIS_HIRES_PRIM_IR","NESDIS_HIRES_PRIM_NONE","NESDIS_HIRES_PRIM_VIS","None","SAVE","ambsave","color","color_sqrt","fnmoc_IR","fnmoc_NONE","fnmoc_VIS","fnmoc_amb_IR","fnmoc_amb_NONE","fnmoc_amb_VIS","hkm","nesdis_25km_IR","nesdis_25km_NONE","nesdis_25km_VIS","nesdis_25km_amb_IR","nesdis_25km_amb_NONE","nesdis_25km_amb_VIS","nesdis_hires_IR","nesdis_hires_NONE","nesdis_hires_VIS","nesdis_hires_amb_IR","nesdis_hires_amb_NONE","nesdis_hires_amb_VIS","nrcs","ols_color","ols_color_sqrt","olsvisible_images_sqrt","pc","pr","qkm","rscat_save","scat_ambiguity","scat_ambiguity_nesdis_25km","scat_ambiguity_nesdis_hires","scat_over_85h","scat_over_85h_amb","scat_over_color37","scat_over_color37_amb","scat_over_colorpct","scat_over_colorpct_amb","scat_over_ir","scat_over_ir_amb","scat_over_none","scat_over_none_amb","scat_over_vis","scat_over_vis_amb","sfc_700_mb","smap","smos","sqrt","tmi","true_color","wind_barbs","wind_barbs_nesdis_25km","wind_barbs_nesdis_hires","wsat_over_85H","wsat_over_85h","wsat_over_colorpct"],
            satellite:["00002","00281","06","12","1B11","Aqua","Aqua-1","Terra","WindSat_6GHz","agua1","amsre","amsub","aqua","aqua-1","aqua1","ascat","coriolis","f-13","f-15","f-16","f-17","f-18","f10","f11","f13","f14","f15","f16","f17","f18","f19","g10","g5","g8","g9","gms","gms-5","gms-6","gms6","goes-10","goes-11","goes-12","goes-13","goes-8","goes-9","goes10","goes11","goes12","goes13","goes14","goes15","goes16","goes17","goes9","goesE","goesW","gpm","h8","himawari-8","himawari8","hm8","idr3_windsat","iss","jpss","lev1","meteo-5","meteo-7","meteo5","meteo7","meteoEU","meteoIO","metop-2","metop-a","metop-b","metop2","metopa","metopb","metopc","msg-1","msg-2","msg1","msg2","msg3","msg4","mtsat-2","mtsat1r","mtsat2","noaa-14","noaa-15","noaa-16","noaa-17","noaa-18","noaa-19","noaa15","noaa16","noaa17","noaa18","noaa19","npp","oceansat-2","oscat","qscat","quickscat","quikscat","scat","scat_COAPS","scat_FNMOC","scat_FNMOC_AMB","scat_WINDSAT","scatsat-1","smap","smos","ssmi","terra","terra1","trmm","windsat","windsat_6GHz_wind","wsat_6GHz_6GHz_wind","wsat_6GHz_wind","x"],
            extension:["jpg","png"]
        },
        requestTime: 1
    };

    state = {
        loadingOptions: false,
        selections: {
            season: [],
            basin: [],
            storm_name: [],
            type: [],
            sensor: [],
            resolution: [],
            satellite: [],
            extension: []
        },
        allImageOptions: {
            season: [],
            basin: [],
            storm_name: [],
            type: [],
            sensor: [],
            resolution: [],
            satellite: [],
            extension: []
        },
        imageOptions: {
            season: [],
            basin: [],
            storm_name: [],
            type: [],
            sensor: [],
            resolution: [],
            satellite: [],
            extension: []
        },
        query: {},
        count: -1,
        imageItems: [],
        imageIndex: 0,
        imageElements: [],
        imageElementsStatus: [],
        startTime: "1997-06-20 09:31",
        endTime: "2019-12-30 12:40",
        beginDate: "1997-06-20 09:31",
        endDate: "2019-12-30 12:40",
        selectedImage: (<div></div>),
        requestTime: 0
    };

    componentDidMount = async () => {
        // this.fetchImageCount({});
        const response = this.startingResponse;
        await this.setState({
            allImageOptions: response.options,
            beginDate: new Date(response.beginDate),
            endDate: new Date(response.endDate)
        });
        this.generateOptions(response);
        const query = {
            "$and": [],
            "startTime": this.state.startTime,
            "endTime": this.state.endTime
        };
        this.fetchImageCount(query);
    };

    handleInputChange = async (evt, {name, id, value}) => {
        console.log(name);
        console.log(id);
        console.log(value);
        // not date change
        let removing = true;
        if (id) {
            removing = this.state.selections[id].length > value.length;
            await this.setState(prevState => ({
                selections: Object.assign(prevState.selections, { [id]: value })
            }));
        }
        // date change
        else if (name) {
            if (value) {
                await this.setState({ [name]: value });
            }
            else {
                if (name == "startTime") {
                    await this.setState({ [name]: "1997-06-20 09:31" });
                }
                if (name == "endTime") {
                    await this.setState({ [name]: "2019-12-30 12:40" });
                }
            }
        }
        // TODO: If removing value requery for that key (ie don't include it in generateOptions)
        const queryList = Object.keys(this.state.selections).map(key => (
            {"$or": this.state.selections[key].map(val => ({ [key]:val }))}
        )).filter(query => query["$or"].length > 0);

        // TODO: Only get options for dropdowns to the right
        // TODO: Potentially maintain mapping (at least for seasons/storms?)
        const query = {
            "$and": queryList,
            "startTime": this.state.startTime,
            "endTime": this.state.endTime
        };
        const keys = removing ? [] : [id];
        this.setState({query});
        this.fetchImageCount(query);
        this.generateOptions(await this.fetchOptions(query, keys));
    };

    /*
     * This function takes all of the key/value pairs of the "request" object and transforms them into url query
     * parameters. So if you get a request object that looks like:
     * { keyOne: valueOne, keyTwo: valueTwo },
     * It will then transform them into a string of the form:
     * keyOne=valueOne&keyTwo=valueTwo
     */
    getQueryParamsFromRequest = request => Object.keys(request).map(key => (`${key}=${request[key]}`)).join("&");

    fetchImageCount = async (query) => {
        this.setState({ count: -1});
        console.log(JSON.stringify(query));
                    fetch(`${this.API_GATEWAY_ENDPOINT}/images/imageCount`, {
            method: "POST",
            body: JSON.stringify(query),
            mode: "cors",
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        }).then((response) => {
            return response.json();
        }).then((data) => {
            this.setState({ count: data.count });
        });
    };

    /**
     * This fetchs options based on what has been selected so far
     * @param query
     * @returns {Promise<void>}
     */
    fetchOptions = async (query, keys) => {
        this.setState({ loadingOptions: true });
        console.log(query);
        const request = {"query": query, "keys": keys};
        console.log(request);
        return fetch(`${this.API_GATEWAY_ENDPOINT}/images/options`, {
            method: "POST",
            body: JSON.stringify(request),
            mode: "cors",
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        }).then((response) => {
            return response.json();
        }).then((data) => {
            this.setState({ loadingOptions: false });
            return data;
        });
    };

    /**
     * Call this when we finally want to search for images
     * @param query
     * @returns {Promise<void>}
     */
    fetchQuery = async () => {
        fetch(`${this.API_GATEWAY_ENDPOINT}/images/query`, {
            method: "POST",
            body: JSON.stringify({"query": this.state.query}),
            mode: "cors",
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        }).then((response) => {
            return response.json();
        }).then((data) => {
            console.log(data);
            this.setState({ imageItems: data.imageItems, imageIndex: 0 });
            this.fetchImages(data.imageItems);
        });
    };

    fetchImages = async (imageItems) => {
        const imageElementsStatus = imageItems.map(item => false);
        await this.setState({ imageElementsStatus });
        const imageElements = imageItems.map((imageItem, index) => {
            return (<Image
                style={{ display: "none" }}
                src={imageItem.image_url}
                alt={imageItem.image}
                key={imageItem.image_url}
                onLoad={(index) => {
                this.setState(prevState => ({
                    imageElementsStatus: [
                      ...prevState.imageElementsStatus.slice(0, index),
                      true,
                      ...prevState.imageElementsStatus.slice(index + 1)
                ]}))}}
            />);
        });
        this.setState({ imageElements });
    };

    generateOptions = async (response) => {
        if (response.requestTime > this.state.requestTime) {
            this.setState({ requestTime: response.requestTime });
            const newOptions = response.options;
            const allOptions = JSON.parse(JSON.stringify(this.state.allImageOptions));
            const imageOptions = JSON.parse(JSON.stringify(this.state.imageOptions));
            Object.keys(newOptions).forEach(key => {
                const options = allOptions[key].map(value => {
                    const group = newOptions[key].includes(value);
                    return {
                        key: value,
                        text: value,
                        value: value,
                        icon: group ? "plus" : "minus",
                    }
                }).sort((a, b) => {
                    if (a.icon === "plus" && b.icon !== "plus") {
                        return -1;
                    }
                    if (a.icon !== "plus" && b.icon === "plus") {
                        return 1;
                    } else {
                        if (a.value > b.value) {
                            return 1;
                        }
                        if (a.value < b.value) {
                            return -1;
                        }
                        return 0;
                    }
                });
                Object.assign(imageOptions, {[key]: options});
            });
            // deal with times
            /*
            let startTime = this.state.startTime;
            let endTime = this.state.endTime;
            if (new Date(response.beginDate) > new Date(startTime)){
                startTime = response.beginDate;
            }
            if (new Date(response.endDate) < new Date(endTime)){
                endTime = response.endDate;
            }
             */
            this.setState({
                imageOptions,
                beginDate: response.beginDate,
                endDate: response.endDate,
                startTime: response.beginDate,
                endTime: response.endDate
            });
        } else {
            console.log(`Bad Request Resposne:${response.requestTime} State:${this.state.requestTime}`)
        }
    };

    render () {
        return (
            <Container>
                <Form>
                    <Form.Group widths={"equal"}>
                        <Form.Field>
                            <label>Season</label>
                            <Form.Dropdown
                                fluid
                                id="season"
                                placeholder='2001'
                                multiple
                                search
                                options={this.state.imageOptions.season}
                                onChange={this.handleInputChange}
                            />
                        </Form.Field>
                        <Form.Field>
                            <label>Season</label>
                            <Form.Dropdown
                                fluid
                                id="basin"
                                placeholder='ATL'
                                multiple
                                search
                                options={this.state.imageOptions.basin}
                                onChange={this.handleInputChange}
                            />
                        </Form.Field>
                        <Form.Field>
                            <label>Storm Name</label>
                            <Form.Dropdown
                                fluid
                                id="storm_name"
                                placeholder="Isabel"
                                multiple
                                search
                                options={this.state.imageOptions.storm_name}
                                onChange={this.handleInputChange}
                            />
                        </Form.Field>
                        <Form.Field>
                            <label>Type</label>
                            <Form.Dropdown
                                fluid
                                id="type"
                                placeholder="vis"
                                multiple
                                search
                                options={this.state.imageOptions.type}
                                onChange={this.handleInputChange}
                            />
                        </Form.Field>
                    </Form.Group>
                    <Form.Group widths={"equal"}>
                        <Form.Field>
                            <label>Sensor</label>
                            <Form.Dropdown
                                fluid
                                id="sensor"
                                placeholder="goesvis"
                                multiple
                                search
                                options={this.state.imageOptions.sensor}
                                onChange={this.handleInputChange}
                            />
                        </Form.Field>
                        <Form.Field>
                            <label>Resolution</label>
                            <Form.Dropdown
                                fluid
                                id="resolution"
                                placeholder="1km"
                                multiple
                                search
                                options={this.state.imageOptions.resolution}
                                onChange={this.handleInputChange}
                            />
                        </Form.Field>
                        <Form.Field>
                            <label>Satellite</label>
                            <Form.Dropdown
                                fluid
                                id="satellite"
                                placeholder="goes15"
                                multiple
                                search
                                options={this.state.imageOptions.satellite}
                                onChange={this.handleInputChange}
                            />
                        </Form.Field>
                        <Form.Field>
                            <label>Extension</label>
                            <Form.Dropdown
                                fluid
                                id="extension"
                                placeholder="jpg"
                                multiple
                                search
                                options={this.state.imageOptions.extension}
                                onChange={this.handleInputChange}
                            />
                        </Form.Field>
                    </Form.Group>
                    <Form.Group>
                        <Form.Field>
                            <label>Start Date</label>
                            <DateTimeInput
                              name="startTime"
                              placeholder="Date Time"
                              dateFormat="YYYY-MM-DD"
                              clearable
                              onClear={this.handleInputChange}
                              minDate={this.state.beginDate}
                              maxDate={this.state.endTime}
                              value={this.state.startTime}
                              iconPosition="left"
                              onChange={this.handleInputChange}
                            />
                        </Form.Field>
                        <Form.Field>
                            <label>End Date</label>
                            <DateTimeInput
                              name="endTime"
                              placeholder="Date Time"
                              dateFormat="YYYY-MM-DD"
                              clearable
                              onClear={this.handleInputChange}
                              minDate={this.state.startTime}
                              maxDate={this.state.endDate}
                              value={this.state.endTime}
                              iconPosition="left"
                              onChange={this.handleInputChange}
                            />
                        </Form.Field>
                    </Form.Group>
                    <Form.Group widths={"equal"}>
                        <Form.Field>
                            <label>Image Count</label>
                            {this.state.count !== -1 ? this.state.count : "Loading"}
                        </Form.Field>
                        <Form.Field>
                            <label>Query:</label>
                            {JSON.stringify(this.state.query)}
                        </Form.Field>
                    </Form.Group>
                    <Form.Button onClick={this.fetchQuery}>Get Images</Form.Button>
                </Form>
                <Container>
                    {this.state.imageElements}
                    {this.state.imageElements.length > 0 ?
                        <DataViewer
                            imageItems={this.state.imageItems}
                            imageElementsStatus={this.state.imageElementsStatus}
                        />
                     : ""}
                </Container>
            </Container>
        );
    }
}

class DataViewer extends Component {

    state = {
        imageIndex: 0
    };

    selectImage = (e, { value }) => {
        const imageIndex = parseInt(value);
        this.setState({imageIndex});
    };

    render() {
        return (
            <Container>
                {this.props.imageElementsStatus[this.state.imageIndex] ?
                    <Image
                        src={this.props.imageItems[this.state.imageIndex].image_url}
                        alt={this.props.imageItems[this.state.imageIndex].image}
                    />
                : <Placeholder>
                    <Placeholder.Image />
                  </Placeholder>}
                  <span>{this.props.imageItems[this.state.imageIndex].date}</span>
                <Form.Input
                    fluid
                    label=''
                    min={0}
                    max={this.props.imageItems.length-1}
                    name=''
                    onChange={this.selectImage}
                    step={1}
                    type='range'
                    value={this.state.imageIndex}
                />
            </Container>
        );
    }
}

export default ImagePage;