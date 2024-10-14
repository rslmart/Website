import {getConnectedGraph} from "./RoyalTreeUtils.js";
import ROYAL_TREE from './royaltree_fixed.json' with { type: "json" };
import MONARCH_LISTS from './monarch_list.json' with { type: "json" };

console.log(getConnectedGraph(ROYAL_TREE, MONARCH_LISTS['Japan']))


