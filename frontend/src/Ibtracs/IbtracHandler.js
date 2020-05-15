import React, {Component} from "react";
import {MenuHeader} from "../Common/CommonComponents";
import {IbtracPage} from './IbtracPage';
import {ScatterplotLayer} from '@deck.gl/layers';
import {HeatmapLayer, GridLayer} from '@deck.gl/aggregation-layers';
import {Container, Form, Grid, Input, Label, Card, List} from "semantic-ui-react";
import {WebMercatorViewport} from '@deck.gl/core';
import {FlyToInterpolator} from 'deck.gl';
// 3rd-party easing functions
import 'd3-ease';
import {easeCubic} from "d3-ease";

class IbtracHandler extends Component {
    API_GATEWAY_ENDPOINT = "http://192.168.0.184:5000";
    // API_GATEWAY_ENDPOINT = "http://127.0.0.1:5000/";

    dropdownIds = ["season", "basin", "subbasin", "name"];

    state = {
        loadingIbtracQuery: false,
        viewState: {
            longitude: -74.006,
            latitude: 40.7128,
            zoom: 6
        },
        allIbtracOptions: {
            "basin":["EP","NA","NI","SA","SI","SP","WP"],
            "date":{"max":"Sun, 16 Feb 2020 00:00:00 GMT","min":"Tue, 25 Oct 1842 03:00:00 GMT"},
            "dist2land":{"max":4843,"min":0},
            "gust":{"max":220,"min":15},
            "lat":{"max":81.0469,"min":-68.5},
            "lon":{"max":266.9,"min":-179.8},
            "name":["3-C","ABAIMBA","ABBY","ABE","ABEL:BETH","ABELA","ABELE","ABIGAIL","ABLE","ADA","ADEL","ADELAIDE:ALICE","ADELE","ADELINE","ADELINE-JULI:JULIET","ADELININA","ADJALI","ADOLPH","ADRIAN","AERE","AGATHA","AGATHE","AGGIE","AGI","AGNES","AGNES:DINAH","AGNIELLE:DARYL","AILA","AIVU","AKA","AKASH","AKONI","ALAN","ALBERTINE","ALBERTO","ALBINE","ALBY","ALCIDE","ALDA","ALENGA","ALESSIA","ALETTA","ALEX","ALEX-ANDRE:ANDRE","ALEXANDRA","ALEXINA","ALFA","ALFRED","ALIBERA","ALICE","ALICIA","ALIFREDY","ALIKA","ALINE","ALININA","ALISON","ALISON:KRISOSTOMA","ALISTAIR","ALLEN","ALLISON","ALLYN","ALMA","ALPHA","ALTHEA","ALVIN","ALVIN:BERTIE","AMANDA","AMANDA:GISELE","AMARA","AMBALI","AMBER","AMELIA","AMI","AMOS","AMPIL","AMY","AMY(-)3","AMY:ELSPETH","ANA","ANACELLE","ANAIS","ANDO","ANDREA","ANDREA:CLAUDINE","ANDREE","ANDRES","ANDREW","ANDRY","ANDY","ANETY","ANGELA","ANGELE","ANGGREK","ANIKA","ANITA","ANITA:WILDA","ANJA","ANN","ANNA","ANNABELLE","ANNE","ANNETTE","ANNETTE:JAMINY","ANNIE","ANTHONY","ANTOINETTE","ARIANE","ARIEL:LEE-ARIEL","ARILISY","ARINY","ARLENE","ARLETTE","ARMELLE","ARMELLE:BESSI","AROLA","ARTHUR","ASHOBAA","ASMA","ASTRIDE","ATANG","ATSANI","ATU","AUDREY","AUDREY:BONNIE","AURORE","AVA","AVIONA","AXEL","B29596","BAAZ","BABE","BABE:BABS:CARLA","BABE:CARLA:CHARLOTTE:CLARA","BABETTE","BABIE","BABIOLA","BABS","BAILU","BAKER","BAKO:BESSI-BAKO","BAKOLY","BAKUNG","BANDU","BANSI","BANYAN","BAOMAVO","BARBARA","BARBARINE","BARIJAT","BARISAONA","BARRY","BART","BAVI","BEATIE","BEATRICE","BEATRICE:IVY","BEATRIZ","BEBE","BEBINCA","BECKY","BEJISA","BELINDA","BELLA","BELLAMINE:MELANIE","BELLE","BELNA","BELTANE","BEMANY","BEMAZAVA","BEN","BENANDRO","BENEDICTE","BENI","BENILDE","BENJAMINE","BENTHA","BENTOJANA","BERENICE","BERGUITTA","BERNADETTE","BERNARD","BERNICE","BERNIDA","BERNIE","BEROBIA","BERT","BERT:CHRISTE","BERTHA","BERTHA(REGN):BETTY","BERTHA:BERTHE","BERTHA:BONNIE","BERTHE:BETTINA","BERT\\HELIOTR:HELIOTROPE","BERYL","BESS","BESS:BONNIE","BESSI","BESSIE","BETA","BETH","BETI","BETSY","BETTINA","BETTY","BEULAH","BEVERLEY","BEVERLEY-EVA:EVA(BEV-EVA)","BEVERLY","BIANCA","BIJLI","BILIE:BILLIE","BILIS","BILL","BILLIE","BILLY","BILLY-LILA:LILA","BINDU","BING","BINGIZA","BIRENDA:DAMIEN","BLAKE","BLANCA","BLANCH(E)","BLANCHE","BLANDINE","BLAS","BOB","BOBALAHY","BOBBIE","BOBBY","BOHALE","BOLA","BOLAVEN","BOLDWIN","BOLOETSE","BONDO","BONGANI","BONGWE","BONITA","BONNIE","BONNY","BOPHA","BORIS","BOUCHRA","BOURA","BRANSBY","BRENDA","BRENDAN","BRET","BRIAN","BRIDGET","BRIGITTA","BRONWYN(SEC","BRUCE","BRUNO","BRYNA","BUALOI","BUD","BUNE","CABOTO","CAITLIN","CALASANJY","CALEB","CALIDERA","CALVIN","CALVINIA","CAM","CAMILLA","CAMILLE","CANDICE","CANDY","CARINA","CARLA","CARLO","CARLOS","CARLOTTA","CARMEN","CAROL","CAROL-DAISY","CAROLINE","CARRIE","CARY","CASS","CATHERINE","CATHY","CEBILE","CECIL","CECILE","CECILIA","CECILY","CELA","CELESTA","CELESTE","CELESTINA","CELIA","CELIMENE","CELIMENE:SAM","CELINA","CELINE","CEMPAKA","CESAR","CEZERA","CHABA","CHAMBO","CHAMPI","CHAN-HOM","CHANCHU","CHANDA","CHANGMI","CHANTAL","CHANTELLE:DANIELLA","CHANTHU","CHAPALA","CHARLES","CHARLEY","CHARLIE","CHARLOTT","CHARLOTTE","CHARLY","CHATAAN","CHEBI","CHEDZA","CHERI","CHERONO","CHIKITA","CHIP","CHLOE","CHOI-WAN","CHRIS","CHRIS:DAMIA","CHRISTELLE","CHRISTIANE","CHRISTINE","CHUCK","CILIDA","CILLA","CIMARON","CINDA","CINDY","CINDY:VICTOR","CLAIRE","CLARA","CLARA:ELISA","CLARE","CLARENCE","CLARISSEE","CLAUDE","CLAUDETTE","CLAUDETTE:VIOLA","CLAUDIA","CLAUDINE","CLEO","CLERA","CLIFF","CLOTILDA","CLOTILDE","CLOVIS","COLETTE","COLIN","COLIN:HOPE","COLINA","COLLEEN","COLLETTE","CONNIE","CONSON","COOK","CORA","CORAL","CORENTIN","CORINNE:CORRINE","CORYNA:HUBERT","COSME","COSTA","CRAIG","CRISTINA","CRISTOBAL","CRYSTAL","CYNTHIA","CYPRIEN","CYRIL","DADAFY","DAHLIA","DAISY","DALE","DALIDA:DEIDRE:DELID","DALILA","DALILIA","DAMA","DAMAN","DAMIEN","DAMIENNE","DAMREY","DAN","DANAE:TERRY","DANAS","DANDO","DANI","DANIEL","DANIELLE","DANITZA","DANITZA:WILF","DANNY","DANY","DAODO","DAPHNE","DAPHNE-FIFI:FIFI","DARBY","DAREN","DARIUS","DARYL","DAVID","DAVILIA","DAVINA","DAWN","DAWN(SECONDA","DAYA","DAYE","DEAN","DEANNA","DEBBIE","DEBBY","DEBORAH:ROBYN","DEBRA","DELFINA","DELIA","DELIFINA","DELILAH","DELIWE","DELLA","DELORES","DELPHINE","DELTA","DENISE","DENNIS","DERA","DES","DESMOND","DESSILIA","DETY","DIAMONDRA","DIANA","DIANE","DIANE:FRANCOISE","DIANMU","DIANNE","DIANNE:JERY","DINA","DINAH","DINEO","DIOLA","DITRA","DIWA","DIXIE","DOAZA","DOG","DOKSURI","DOLLY","DOLORES","DOLORESSE","DOLPHIN","DOM","DOMIN:HILARY","DOMINIC","DOMINIQUE","DOMINIQUE:HILARY","DOMITILE","DOMOINA","DON","DONA","DONALINE","DONGO","DONNA","DORA","DOREEN","DORIA","DORIAN","DORINA","DORIS","DORIS-GLORIA:GLORIA","DOROTHEE","DOROTHY","DOT","DOTTIE","DOUG","DOUGLAS","DOVI","DOYLE","DRENA","DUJUAN","DULCIE","DULCINEE","DUMAZILE","DUMILE","DURGA","DURIAN","DYLAN","EARL","EASY","EBULA","ED","EDDIE","EDDY","EDILSON","EDISOANA","EDITH","EDME","EDMEA","EDNA","EDOARA","EDOUARD","EDWIG","EDWIGE","EDWINA","EDZANI","EGLANTINE","EILEEN","EKEKA","ELA","ELAINE","ELE","ELEANOR","ELECTRE","ELENA","ELENORE","ELI","ELIA","ELIAKIM","ELIANE","ELIDA","ELINAH","ELINE:LEONE","ELINOR","ELISA","ELITA","ELIZABETHA","ELLA","ELLEN","ELLIE","ELLIS","ELMA","ELNORA","ELNUS","ELOISE","ELSA","ELSIE","ELVINA","ELVIS","EMA","EMANG","EMERAUDE","EMILIA","EMILIE","EMILY","EMILY(NEW C","EMMA","EMMA:FREDA","EMMANUELLE","EMMY","ENAWO","ENID","ENID:FANNY","ENOK","ENRIQUE","EPI","EPSILON","ERIC","ERICA","ERICK","ERIKA","ERIN","ERINESTA","ERNEST","ERNESTO","ERNIE","ERROL","ESAMI","ESAU","ESETA","ESITERA","ESMERALDA","ESTELLE","ESTHER","ETAU","ETHEL","EUGENE","EUGENIE","EUNICE","EVA","EVA(BEV-EVA)","EVAN","EVARISTE","EVE","EVELYN","EVRINA:FREDERIC","EWINIAR","EZENINA:GWENDA","FABIAN","FABIENNE","FABIO","FABRIOLA","FAITH","FAKIR","FAME","FAMI","FANAPI","FANELE","FANI","FANJA:VIVIENNE","FANNY","FANOOS","FANTALA","FARAH:PEARL","FARI","FARIDA","FATIMA","FATOU","FAUSTINE","FAUSTO","FAVIO","FAXAI","FAY","FAYE","FAYE(GLORIA)","FAYE(GLORIA):GLORIA","FEFA","FEHI","FELANA","FELAPI","FELICE","FELICIA","FELICIE","FELICITY","FELIKSA","FELIX","FELLENG","FELY","FENGSHEN","FERDINAND","FERGUS","FERN","FERNAND","FERNANDA","FERNANDE","FERNANDO","FICO","FIFI","FIFI:ORLENE","FILAO","FILI","FILOMENA","FINELLA","FIONA","FIONA-GWENDA:GWEND","FIRINGA","FITOW","FIVE-E","FLAMBOYAN","FLETCHER","FLEUR","FLO","FLORA","FLORE","FLORENCE","FLORESCYCLO","FLORINE","FLOSSIE","FLOSSIE:GRACE","FLOSSY","FLOYD","FOBANE","FODAH","FORREST","FOX","FRAN","FRAN:GEORGIA","FRANCELIA","FRANCENE","FRANCENE:FRANCESCA","FRANCES","FRANCESCA","FRANCINE","FRANCISCO","FRANK","FRANKIE","FRANKLIN","FRED","FREDA","FREDA:GILDA","FREDDY","FREDEGONDE","FREDERIC","FREDERIQUE","FRIDA","FRIEDA","FRITZ","FUNA","FUNANI","FUNDI","FUNG-WONG","FUNSO","GABEKILE","GABRIELLE","GAEL","GAELLE","GAEMI","GAFILO","GAIL","GAJA","GALY","GAMEDE","GAMMA","GARRY","GARY","GASITAO","GASTON","GAVIN","GAY","GAY-OLIVE:OLIVE:PEGGY","GELANE","GELENA","GELIE","GEMMA","GENE","GENEVIEVE","GEORGE","GEORGES","GEORGETTE","GEORGIA","GERALD","GERALDA","GERARD","GERDA","GERIMENA","GERMAINE","GERRY","GERT","GERTIE","GERTRUDE","GERTRUDE:LEILA","GERVAISE","GHISLAINE","GIGI:TESSIE","GIL","GILBERT","GILBERTE","GILDA","GILDA:IVY","GILLETTE","GILLIAN","GILMA","GINA","GINA:JANINE","GINETTE","GINETTE:MYRTLE","GINGER","GINNY","GINO","GIOVANNA","GIRI","GISELE:GISELLE","GISELLE","GISTA","GITA","GIZELA","GLADYS","GLENDA","GLORIA","GLYNIS","GONI","GONU","GONZALO","GORDON","GRACE","GRACIA","GRACIE","GRAHAM","GRANT","GREG","GREGOARA:WALTER","GRETA","GRETCHEN","GRETEL","GRETELLE","GRITELLE","GUBA","GUCHOL","GUILLAUME","GUILLERMO","GUITO","GULA","GUSTAV","GUYLIANNE","GWEN","GWENDA","GYAN","HADI","HAGIBIS","HAGUPIT","HAIKUI","HAIMA","HAISHEN","HAITANG","HAIYAN","HAJA","HAL","HALEH","HALEY","HALI","HALIBA","HALLIE","HALOLA","HALONG","HAMISH","HANA","HANITRA:LEON","HANK","HANNA","HANNAH","HANSELLA","HANTA","HAPE","HAROLD","HARRIET","HARRIET:HEATHER","HARRY","HARUNA","HARVEY","HARY","HATO","HATTIE","HAZEL","HAZEN","HEATHER","HEBERTE","HECTOR","HEIDA","HEIDI","HELEN","HELEN:HELLEN","HELENA","HELENE","HELGA","HELINDA:PANCHO","HELIOS","HELISAONINA","HELLEN","HELMA:NICKY-HELMA","HELOSE","HELY","HELYETTE","HENNIE","HENRI","HENRIETTA","HENRIETTE","HENRY","HERB","HERBERT","HERBIE","HERMINE","HERMIONE","HERNAN","HERVEA","HESTER","HETA","HETTIE","HIGOS","HIKAA","HIKI","HILARY","HILDA","HILWA","HINA","HINANO","HOLA","HOLLANDA","HOLLY","HONDO","HONORINE","HONORININA","HOPE","HORTENSE","HOW","HOWARD","HR19S(MONA):MONA","HUBERT","HUBERTE","HUDAH","HUDHUD","HUGO","HUGUETTE","HUKO","HUMBA","HUMBERTO","HUNT","HUTELLE","HYACINTH","HYACINTHE","IADINE","IAN","IANA","IARIMA","IARISENA","IDA","IDAI","IDYLLE","IGGY","IGNACIO","IGOR","IKALA","IKE","IKOLA","IKONJO","ILEANA","ILETTA","ILONA","ILSA","IMA","IMANI","IMBOA","IMBUDO","IMELDA","IN-FA","INDLALA","INES","INEZ","INGA","INGRID","INIGO","INIKI","INNIS","INNOCENTE","IO:JACK","IOKE","IONE","IONE-1","IONE-2","IONIA","IPHIGENIE:TILLY","IRA","IRAH","IRENA","IRENE","IRENE:OLIVIA","IRINA","IRIS","IRMA","IRNA:JANE","IRVING","IRWIN","ISA","ISAAC","ISABEAU","ISABEL","ISANG","ISBELL","ISELLE","ISEULT","ISHA","ISIDORE","ISIS","ISMAEL","ISOBEL","ITA","ITELLE","ITEM","ITSENG:OSCAR-ITSANG","IUNE","IVA","IVAN","IVANNE","IVANOE","IVETTE","IVO","IVOR","IVY","IVY66","IVY:JEAN","IWA","IZILDA","JACINTHE","JACK","JACKIE","JACKIE:LAURA","JACOB","JACQUELINE","JADE","JAL","JAMALA","JAMINY","JAN","JANA","JANE","JANET","JANGMI","JANICE","JANIE","JANIS","JAPHET","JASMINE","JASON","JASPER","JAVIER","JAYA","JEAN","JEANA","JEANNE","JEANNE:JEANNIE","JEBI","JEFF","JEFOTRA","JELAWAT","JEN-KATH","JENNA","JENNIFER","JENNY","JENNY(REGEN","JERRY","JESSIE","JESSY","JEWEL","JIG","JIM","JIMENA","JIMMY","JINABO","JO","JOALANE","JOAN","JOAN:MIRIAM","JOANINHA","JOANNE","JOAQUIN","JOE","JOEL","JOELLE","JOHANNE","JOHN","JOKWE","JONGDARI","JONI","JONI:KOJI","JOSE","JOSEPHINE","JOSIE","JOSTA","JOTI","JOURDANNE","JOVA","JOY","JOYCE","JUAN","JUBA","JUDITH","JUDITH:MARTHA","JUDY","JULIA","JULIE","JULIET","JULIETTE","JULIO","JULITA","JUNE","JUNON","JUSTIN","JUSTINE","KAEMI","KAI-TAK","KAJIKI","KALINKA","KALMAEGI","KALUNDE","KAMBA","KAMISY","KAMMURI","KANOA","KARA","KAREN","KAREN:LUCILLE","KARINA","KARINE","KARL","KARLA","KARLETTE","KATE","KATHERINE","KATHLEEN","KATHY","KATHY:MICHELE","KATIA","KATIE","KATRINA","KAY","KAY:NANCY","KEILA","KEITH","KELI","KELLY","KELVIN","KELVINA","KEN","KEN-LOLA:LOLA","KENANGA","KENDRA","KENI","KENNA","KENNETH","KENT","KEONI","KERRY","KESINY","KETSANA","KEVIN","KEZIA","KHAI-MUK","KHANUN","KIKA","KIKI1","KIKI1:KIKI2","KIKO","KILO","KIM","KINA","KING","KINNA","KIRK","KIROGI","KIRRILY","KIRSTEN","KIRSTY","KIT","KITTY","KLARA","KLAUS","KNUT","KOFI","KOLIA","KOMEN","KOMPASU","KONG-REY","KONI","KONITA","KOPPU","KORYN","KRISOSTOMA","KRISTEN","KRISTY","KRISY","KROSA","KROVANH","KUENA","KUJIRA","KULAP","KYANT","KYARR","KYLE","KYLIE","LAILA","LALA","LAM","LAN","LANA","LANCE","LANE","LARRY","LAURA","LAURE","LAURENCE","LAURIE","LEAH(REGENE","LEE","LEEPI","LEHAR","LEKIMA","LENA","LENNY","LEO","LEONIE","LES","LESLEY","LESLIE","LESTER","LEVI","LEWIS","LEX","LEZISSY","LI","LIBBY","LIDIA","LIDY","LILA","LILI","LILLIAN","LILLY","LILY","LIN","LINDA","LINDSAY","LINFA","LINGLING","LIONROCK","LISA","LISE","LISE:YVONNE","LISETTE","LITANNE","LIUA","LIZA","LOIS","LOKE","LOLA","LONGWANG","LORENA","LORENZO","LORIS","LORNA","LORRAINE","LOTTIE","LOTTIE:NATALIE","LOUISE","LOUISE:MARGE","LOVE","LOWELL","LUA","LUBAN","LUCIE","LUCILLE","LUCRETIA:NANCY","LUCY","LUIS","LUKE","LULU","LUMA","LUPIT","LUSI","LYDIE","LYNN","MA-ON","MAARUTHA","MABEL","MAC","MADELINE","MADGE","MADI","MAEMI","MAGDA","MAGGIE","MAGGIE-MURIEL","MAGGIE-MURIEL:MURIEL","MAHA","MAHASEN:VIYARU","MAKA","MALA","MALAKAS","MALIA","MALIKSI","MALOU","MAMIE","MAN-YI","MANGKHUT","MANNY","MANOU","MANU","MANUEL","MARCELLE","MARCIA","MARCO","MARCUS","MARGE","MARGOT","MARIA","MARIAN","MARIE","MARILYN","MARIO","MARIOLA","MARION","MARK","MARLENE","MARTHA","MARTIN","MARTY","MARY","MARYLOU","MATMO","MATSA","MATTHEW","MAUD","MAUREEN","MAURY","MAVIS","MAWAR","MAX","MAY","MAYSAK","MEARI","MEENA","MEGH","MEGI","MEKKHALA","MEKUNU:SAGAR","MELANIE","MELE","MELI","MELISSA","MELOR","MERANTI","MERBOK","MICHAEL","MICHELLE","MICK","MIKE","MILDRED","MILES","MINDULLE","MINDY","MIREILLE","MIRIAM","MIRINAE","MISSATHA","MITAG","MITCH","MITCHELL","MOKE","MOLAVE","MONA","MONICA","MONIQUE","MONTY","MORA","MORAKOT","MORT","MUIFA","MUJIGAE","MUKDA","MUN","MURJAN","NABI","NADA","NADIA","NADINE","NAKRI","NALGAE","NAMTHEUN","NAMU","NANA","NANAUK","NANCY","NANETTE","NANGKA","NANMADOL","NANO","NAOMI","NARDA","NARELLE","NARGIS","NARI","NAT","NATALIE","NATE","NATHAN","NED","NEIL","NEKI","NELE","NELL","NELLIE","NELLY","NELSON","NEOGURI","NEPARTAK","NESAT","NESSIE","NESTOR","NEVILLE","NEWTON","NIALA","NICHOLAS","NICHOLE","NICOLE","NIDA","NIGEL","NIKI","NIKO","NILAM","NILOFAR","NINA","NISHA","NISHA:ORAMA","NOCK-TEN","NOEL","NOGURI","NONA","NORA","NORA:PATSY","NORAH","NORBERT","NOREEN","NORMA","NORMAN","NORRIS","NORU","NOT_NAMED","NOUL","NURI","NUTE","OCKHI","OCTAVE","ODESSA","ODETTE","ODILE","ODILLE","OFA","OFELIA","OGDEN","OHO","OKA","OLA","OLAF","OLGA","OLI","OLINDA","OLIVE","OLIVER","OLIVIA","OLIWA","OLWYN","OMA","OMAIS","OMAR","OMEKA","OMELIA","OPAL","OPAL:RUTH","OPHELIA","ORA","ORAJI:TORAJI","ORCHID","ORLA","ORLENE","ORSON","OSCAR","OSEA","OSSIA","OSWALD","OTIS","OTTO","OTTO(SECONDA","OWEN","PABLO","PABUK","PADDY","PAGE","PAINE","PAKA-","PAKHAR","PALI","PALOMA","PAM","PAMELA","PANCHO","PARMA","PAT","PAT:RUTH","PATRICIA","PATSY","PATTY","PAUL","PAULA","PAULINE","PAWAN","PEARL","PEDRO","PEGGY","PEIPAH","PEKE","PENI","PENNY","PERCY","PETA","PETE","PETER","PETIE","PEWA","PHAILIN","PHANFONE","PHET","PHETHAI","PHIL","PHILIPPE","PHOEBE","PHYAN","PHYLLIS","PIERRE","PILAR","PIPER","PODUL","POLA","POLLY","POLO","PONGSONA","PRAPIROON","PREMA","PRISCILL","PRISCILLA","PRUDENCE","QUANG","QUEENIE","QUENTON","QUERIDA","RACHEL","RAE","RAFAEL","RAI","RAJA","RAMMASUN","RAMON","RAMONA","RANANIM","RAQUEL","RASHMI","RAY","RAYMOND","REBECCA","REBEKAH","RENA","RENE","REUBEN","REWA","REX","RHODA","RHONDA","RICHARD","RICK","RILEY","RINA","RITA","ROANU","ROBERT","ROBYN","ROGER","ROKE","ROMA","RON","RONA","ROSA","ROSALIE","ROSALIND","ROSALYN:ROSLYN","ROSE","ROSIE","ROSITA","ROSLYN","ROXANNE","ROY","RUBY","RUMBIA","RUSA","RUSS","RUSTY","RUTH","RYAN","SABA","SADIE","SALLY","SAM","SANBA","SANDRA","SANDY","SANVU","SAOLA","SAOMAI","SARAH","SARAI","SARIKA","SAVANNAH","SCOTT","SEAN","SEBASTIEN","SELMA","SELWYN","SEPAT","SERGIO","SETH","SEYMORE:SEYMOUR","SEYMOUR","SHANSHAN","SHARON","SHARY","SHEILA","SHEILASOPHIE","SHIRLEY","SIBYL","SID","SIDR","SIMON","SIMONE","SINA","SINLAKU","SKIP","SOLO","SON-TINH","SONAMU","SONCA","SONGDA","SONIA","SOSE","SOUDELOR","SOULIK","SPERRY","STAN","STELLA","STEVE","SUDAL","SUE","SUSAN","TAHMAR","TALAS","TALIM","TAM","TAMMY","TANYA","TAPAH","TARA","TASHA","TATIANA","TED","TEMBIN","TERESA","TERRI","TERRY","TESS","TESS:VAL","TESSA","TESSI","THAD","THANE","THELMA","THEODORE","THERESE","THOMAS:TOMAS","TIA","TICO","TIFFANY","TILDA","TILLIE","TILLY","TIM","TINA","TINGTING","TINO","TIP","TITLI","TODD","TOKAGE","TOM","TOMAS","TOMASI","TONY","TORAJI","TRACY","TRAMI","TREVOR","TRINA","TRIX","TRIXIE","TRUDY","TUI","TUNI","TUSI","UESI","ULA","ULEKI","ULIKA","ULUI","UMA:VELI","UNA","UNALA","UPANA","UPIA","URIAH","URMIL","URSULA","USAGI","USHA","UTOR","VAE","VAIANU","VAL","VALERIE","VAMCO","VAMEI","VANCE","VANESSA","VANIA","VARDAH","VAUGHAN","VAYU","VEENA","VELI","VELMA","VERA","VERA(SECON)","VERN","VERNA","VERNE","VERNON","VERONICA","VICENTE","VICKI","VICKY","VICTOR","VICTORIA","VIDA","VINCE","VINCENT","VIOLA","VIOLET","VIPA","VIRGIL","VIRGINIA","VIVIAN","VIVIENNE","VONGFONG","WAKA","WALAKA","WALDO","WALI","WALLACE","WALLIE","WALLY","WALT","WALTER","WANDA","WARD","WARREN","WASA","WASHI","WATI","WATOREA","WAYNE","WENDY","WENE","WES","WILA","WILDA","WILLA","WILLIAM","WILLIE","WILLY","WILMA","WINI","WINIFRED","WINNIE","WINONA","WINSOME","WINSTON","WIPHA","WUKONG","WUTIP","WYLVA","WYNNE","XANGSANE","XAVIER","XINA","YAGI","YALI","YALO","YANCY","YANI","YANNI","YANYAN","YASI","YATES","YOLANDA","YOLANDE","YORK","YULE","YUNYA","YURI","YUTU","YVETTE","YVONNE","ZACK","ZAKA","ZANE","ZEB","ZEKE","ZELDA","ZELIA","ZENA","ZETA","ZIA","ZITA","ZOE","ZOLA","ZUMAN"],
            "pres":{"max":1024,"min":870},
            "season":[1842,1845,1848,1851,1852,1853,1854,1855,1856,1857,1858,1859,1860,1861,1862,1863,1864,1865,1866,1867,1868,1869,1870,1871,1872,1873,1874,1875,1876,1877,1878,1879,1880,1881,1882,1883,1884,1885,1886,1887,1888,1889,1890,1891,1892,1893,1894,1895,1896,1897,1898,1899,1900,1901,1902,1903,1904,1905,1906,1907,1908,1909,1910,1911,1912,1913,1914,1915,1916,1917,1918,1919,1920,1921,1922,1923,1924,1925,1926,1927,1928,1929,1930,1931,1932,1933,1934,1935,1936,1937,1938,1939,1940,1941,1942,1943,1944,1945,1946,1947,1948,1949,1950,1951,1952,1953,1954,1955,1956,1957,1958,1959,1960,1961,1962,1963,1964,1965,1966,1967,1968,1969,1970,1971,1972,1973,1974,1975,1976,1977,1978,1979,1980,1981,1982,1983,1984,1985,1986,1987,1988,1989,1990,1991,1992,1993,1994,1995,1996,1997,1998,1999,2000,2001,2002,2003,2004,2005,2006,2007,2008,2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020],
            "speed":{"max":148,"min":0},
            "subbasin":["AS","BB","CP","CS","EA","GM","MM","NA","WA"],
            "wind":{"max":185,"min":3}
        },
        ibtracOptions: {
            season: [],
            basin: [],
            subbasin: [],
            name: []
        },
        selections: {
            season: [],
            basin: [],
            subbasin: [],
            name: []
        },
        typingTimeout: {},
        query: {},
        requestTime: 0,
        ibtracData: [],
        plotType: "scatter",
        dataLayer: null,
        dataLayerValues: {
            radiusPixels: 30,
            intensity: 1,
            threshold: .05,
            cellSize: 100000,
            elevationScale: 100,

        }
    };

    componentDidMount = async () => {
        this.generateOptions({options: this.state.allIbtracOptions, requestTime: 1});
        const response = await this.fetchOptions({}, []);
        await this.setState({
            allIbtracOptions: response.options,
            beginDate: new Date(response.beginDate),
            endDate: new Date(response.endDate)
        });
        this.generateOptions(response);
        // this.fetchIbtracCount(query);
    };

    /**
     * This fetchs options based on what has been selected so far
     * @param query
     * @returns {Promise<void>}
     */
    fetchOptions = async (query, keys) => {
        this.setState({ loadingOptions: true });
        const request = {"query": query, "keys": keys};
        return fetch(`${this.API_GATEWAY_ENDPOINT}/ibtracs/options`, {
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

    renderTooltip = () => {
        const {hoveredObject, pointerX, pointerY} = this.state || {};
        return hoveredObject && (
            <Card style={{position: 'absolute', zIndex: 1, pointerEvents: 'none', left: pointerX, top: pointerY}}>
                <Card.Content>
                  <Card.Header>{hoveredObject.name}</Card.Header>
                  <Card.Meta>
                    <span className='date'>{hoveredObject.date}</span>
                  </Card.Meta>
                  <Card.Description>
                      <List>
                          <List.Item>Wind: {hoveredObject.wind || "-"}</List.Item>
                          <List.Item>Pressure: {hoveredObject.pres || "-"}</List.Item>
                          <List.Item>Gust: {hoveredObject.gust || "-"}</List.Item>
                      </List>
                  </Card.Description>
                </Card.Content>
            </Card>
        );
    };

    handleDataLayerValueChange = (evt, {id, value}) => {
        this.setState(prevState => ({
            dataLayerValues: {
                ...prevState.dataLayerValues,
                [id]: parseFloat(value)
            }
        }));
        console.log(this.state.dataLayerValues);
        this.handlePlotTypeChange({}, { value: this.state.plotType});
    };

    handlePlotTypeChange = async (evt, {value}) => {
        let dataLayer;
        switch (value) {
            case "heatmap":
                dataLayer = new HeatmapLayer({
                    id: 'heatmapLayer',
                    data: this.state.ibtracData,
                    radiusPixels: this.state.dataLayerValues.radiusPixels,
                    intensity: this.state.dataLayerValues.intensity,
                    threshold: this.state.dataLayerValues.threshold,
                    getPosition: d => [d.lon, d.lat],
                });
                break;
            case "scatter":
                dataLayer = new ScatterplotLayer({
                    id: 'scatterplot-layer',
                    data: this.state.ibtracData,
                    pickable: true,
                    opacity: 0.8,
                    stroked: true,
                    filled: true,
                    radiusScale: 6,
                    radiusMinPixels: 1,
                    radiusMaxPixels: 100,
                    lineWidthMinPixels: 1,
                    getPosition: d => [d.lon, d.lat],
                    getRadius: d => 100,
                    getFillColor: d => {
                        if (d.wind >= 137){
                            return [255, 102, 255];
                        }
                        if (d.wind >= 113){
                            return [204, 0, 255];
                        }
                        if (d.wind >= 96){
                            return [204, 0, 255];
                        }
                        if (d.wind >= 83){
                            return [255, 153, 0];
                        }
                        if (d.wind >= 64){
                            return [102, 255, 51];
                        }
                        if (d.wind >= 34){
                            return [0, 255, 255];
                        }
                        if (d.wind > 0){
                            return [0, 0, 255];
                        }
                        return [255,255,255];
                    },
                    getLineColor: d => [0, 0, 0],
                    onHover: info => this.setState({
                      hoveredObject: info.object,
                      pointerX: info.x,
                      pointerY: info.y
                    })
                });
                break;
            case "grid":
                dataLayer = new GridLayer({
                    id: 'new-grid-layer',
                    data: this.state.ibtracData,
                    pickable: true,
                    extruded: true,
                    cellSize: this.state.dataLayerValues.cellSize,
                    elevationScale: this.state.dataLayerValues.elevationScale,
                    getPosition: d => [d.lon, d.lat],
                  });
                break;
            case "gridMax":
                dataLayer = new GridLayer({
                    id: 'new-grid-layer',
                    data: this.state.ibtracData,
                    pickable: true,
                    extruded: true,
                    cellSize: this.state.dataLayerValues.cellSize,
                    elevationScale: this.state.dataLayerValues.elevationScale,
                    colorDomain: [3, 185],
                    elevationDomain: [3, 185],
                    getPosition: d => [d.lon, d.lat],
                    getElevationWeight: p => p.wind,
                    getColorWeight: p => p.wind,
                    colorAggregation: 'MAX',
                    elevationAggregation: 'MAX'
                  });
                break;
            case "gridMin":
                // subtract min press
                dataLayer = new GridLayer({
                    id: 'new-grid-layer',
                    data: this.state.ibtracData,
                    pickable: true,
                    extruded: true,
                    cellSize: this.state.dataLayerValues.cellSize,
                    elevationScale: this.state.dataLayerValues.elevationScale,
                    colorDomain: [870, 1024],
                    elevationDomain: [870, 1024],
                    getPosition: d => [d.lon, d.lat],
                    getElevationWeight: p => p.pres,
                    getColorWeight: p => p.pres,
                    colorAggregation: 'MIN',
                    elevationAggregation: 'MIN'
                  });
                break;
        }
        this.setState({ plotType: value, dataLayer })
    };

    handleDateSliderChange = async(data, id) => {
        await this.setState(prevState => ({
            selections: Object.assign(prevState.selections, { [id]: data })
        }));
        const keys = this.state.selections[id].length > data.length ? [] : [id];
        const query = this.generateQuery();
        this.setState({ query });
        this.generateOptions(await this.fetchOptions(query, keys));
    };

    handleDropdownChange = async (evt, {id, value}) => {
        await this.setState(prevState => ({
            selections: Object.assign(prevState.selections, { [id]: value })
        }));
        const keys = this.state.selections[id].length > value.length ? [] : [id];
        const query = this.generateQuery();
        this.setState({ query });
        this.generateOptions(await this.fetchOptions(query, keys));
        //this.fetchRecordCount(query);
        //this.generateOptions(await this.fetchOptions(query, keys));
    };

    // TODO: Need to wait until a user has stopped typing for min/max fields
    // TODO: Should probably also just separate the min/max fields from the dropdown functions
    handleInputChange = async (evt, {id, value}) => {
        const intValue = parseInt(value);
        await this.setState(prevState => ({
            selections: Object.assign(prevState.selections, { [id]: intValue })
        }));
        const keys = value.length === 0 ? [] : [id];
        const query = this.generateQuery();
        this.setState({ query });

        if (this.state.typingTimeout[id]) {
            clearTimeout(this.state.typingTimeout[id]);
        }

        const self = this;
        this.setState(prevState => ({
            typingTimeout: Object.assign(prevState.typingTimeout, { [id]: setTimeout(
                 async () => {
                    self.generateOptions(await self.fetchOptions(query, keys));
                },
                1000
            )})
        }));

        //
        //this.fetchRecordCount(query);
        //this.generateOptions(await this.fetchOptions(query, keys));
    };

    generateQuery = () => {
        const selections = Object.assign({}, this.state.selections);
        const queryList = [];
        Object.keys(selections).forEach(key => {
            if (key.includes("max") || key.includes("min")) {
                if (selections[key] && typeof selections[key] === 'number') {
                    const actualKey = key.split("_")[0];
                    if (key.includes("max")) {
                        queryList.push({[actualKey]: {"$lte": selections[key]}})
                    } else {
                        queryList.push({[actualKey]: {"$gte": selections[key]}})
                    }
                }
            } else if (["day", "month", "year"].some(id => id === key)) {
                queryList.push({[key]: {"$gte": selections[key][0]}})
                queryList.push({[key]: {"$lte": selections[key][1]}})
            }  else if (selections[key].length > 0) {
                queryList.push({"$or": selections[key].map(selection => {return { [key]: selection }})});
            }
        });
        if (queryList.length > 0) {
            return { "$and": queryList }
        }
        return {};
    };

    generateOptions = async (response) => {
        if (response.requestTime > this.state.requestTime) {
            this.setState({ requestTime: response.requestTime });
            const newOptions = response.options;
            const allOptions = JSON.parse(JSON.stringify(this.state.allIbtracOptions));
            const ibtracOptions = JSON.parse(JSON.stringify(this.state.ibtracOptions));
            this.dropdownIds.forEach(key => {
                if (Object.keys(newOptions).includes(key)) {
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
                    Object.assign(ibtracOptions, {[key]: options});
                }
            });
            Object.keys(allOptions)
                .filter(key => !this.dropdownIds.includes(key))
                .forEach(key => Object.assign(ibtracOptions, {[key]: newOptions[key]}));
            console.log(ibtracOptions);
            this.setState({
                ibtracOptions,
                beginDate: response.beginDate,
                endDate: response.endDate,
                startTime: response.beginDate,
                endTime: response.endDate
            });
        } else {
            console.log(`Bad Request Resposne:${response.requestTime} State:${this.state.requestTime}`)
        }
    };

    /**
     * Call this when we finally want to search for ibtrac records
     * @param query
     * @returns {Promise<void>}
     */
    fetchQuery = async () => {
        let data = {};
        this.setState({ loadingIbtracQuery: true, ibtracData: [] });
        await fetch(`${this.API_GATEWAY_ENDPOINT}/ibtracs/query`, {
            method: "POST",
            body: JSON.stringify({"query": this.state.query, "storm": false}),
            mode: "cors",
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        }).then((response) => {
            return response.json();
        }).then((responseJson) => {
            console.log(responseJson);
            data = responseJson;
        });
        console.log(data.coordinates.lon.max, data.coordinates.lat.max);
        console.log(data.coordinates.lon.min, data.coordinates.lat.min);
        const {longitude, latitude} = new WebMercatorViewport(this.state.viewState).fitBounds([
            [data.coordinates.lon.max, data.coordinates.lat.max],
            [data.coordinates.lon.min, data.coordinates.lat.min],
         ]);
        console.log(longitude, latitude);
        await this.setState({
            loadingIbtracQuery: false,
            ibtracData: data.ibtracData,
            viewState: {
                ...this.state.viewState,
                longitude,
                latitude,
                transitionDuration: 2000,
                transitionInterpolator: new FlyToInterpolator(),
                transitionEasing: easeCubic
            }
        });
        this.handlePlotTypeChange({}, { value: this.state.plotType });
    };

    onViewStateChange = ({viewState}) => {
        const {width, height, ...etc} = viewState;
        this.setState({viewState: etc});
    };

    render () {
        return (
            <IbtracPage
                viewState={this.state.viewState}
                onViewStateChange={this.onViewStateChange}
                ibtracOptions={this.state.ibtracOptions}
                loadingIbtracQuery={this.state.loadingIbtracQuery}
                ibtracData={this.state.ibtracData}
                dataLayer={this.state.dataLayer}
                fetchQuery={this.fetchQuery}
                plotType={this.state.plotType}
                dataLayerValues={this.state.dataLayerValues}
                handleDateSliderChange={this.handleDateSliderChange}
                handleDropdownChange={this.handleDropdownChange}
                handleInputChange={this.handleInputChange}
                handlePlotTypeChange={this.handlePlotTypeChange}
                handleDataLayerValueChange={this.handleDataLayerValueChange}
                renderTooltip={this.renderTooltip()}
            />
        );
    }
}

export default IbtracHandler;