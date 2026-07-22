"""End-to-end data pipeline for the royal tree charts.

The pipeline used to be a set of scripts each with a hardcoded ``__main__`` that
ran a single country, so the run order and the role of each intermediate file
were tribal knowledge. This module makes the sequence explicit and runnable.

Stages (per monarchy):
  1. GetListOfMonarchs.get_monarch_lists  -> data/monarch_list.json
       Scrape the ordered list of monarchs per country and resolve to Wikidata
       IDs. (Network + Wikipedia; the brittle step.)
  2. GetData.get_monarch_data             -> data/<M>.json, data/<M>_family_tree.json
       Hydrate every monarch (and relatives) from Wikidata and reconstruct the
       succession family tree via BFS. (Network + Wikidata.)
  3. GetData.label_people                 -> data/<M>_labelled.json
       Replace Wikidata Q-IDs with human-readable labels.
  4. CleanRoyalTreeData.clean_and_combine -> data/monarchy_data.json,
                                             data/monarchy_family_trees.json
       Merge the per-country labelled data into the deduplicated combined files.
  5. SplitDataForFrontend.split           -> public/royalty/<M>.json.gz, index.json
       Bake per-monarchy gzipped subsets the React app fetches at runtime.

The per-country files from stages 1-3 are regenerable caches (gitignored). The
combined files from stage 4 and the public assets from stage 5 are what the app
uses.

Usage:
  python pipeline.py --all
  python pipeline.py England France Spain
  python pipeline.py England --skip-lists   # reuse the existing monarch_list.json
  python pipeline.py --split-only           # only rebuild public/ from combined files
"""
import argparse
import os

import BuildHouses
import CleanRoyalTreeData
import GatherAncestors
import GetData
import GetListOfMonarchs
import SplitDataForFrontend

# The scripts use paths relative to this directory (e.g. "data/..").
os.chdir(os.path.dirname(os.path.abspath(__file__)))

ALL_MONARCHIES = GetListOfMonarchs.monarchies


def run(monarchies, skip_lists=False, with_ancestors=True):
    if not skip_lists:
        GetListOfMonarchs.get_monarch_lists(monarchies)
    GetData.get_monarch_data(set(monarchies))
    # Gather ancestor closures before labelling so the extra people get labelled
    # in the same pass. gather_ancestors is European-only (shallow shared-ancestor
    # bridging); gather_deep_ancestors reconnects the Mongol houses to Genghis via
    # one deep lineage. Both no-op for monarchies outside their target sets.
    if with_ancestors:
        GatherAncestors.gather_ancestors(monarchies)
        GatherAncestors.gather_deep_ancestors(monarchies)
    GetData.label_people(monarchies)
    CleanRoyalTreeData.clean_and_combine(set(monarchies))
    if with_ancestors:
        GatherAncestors.combine_ancestors(monarchies)
    # Houses derive from the combined pool, so build them after it's assembled.
    BuildHouses.build_houses()
    SplitDataForFrontend.split()
    SplitDataForFrontend.split_houses()


def run_ancestors_only(monarchies):
    """Layer common-ancestor data onto an already-built dataset (no succession rebuild)."""
    GatherAncestors.gather_ancestors(monarchies)
    GetData.label_people(monarchies)
    GatherAncestors.combine_ancestors(monarchies)
    BuildHouses.build_houses()
    SplitDataForFrontend.split()
    SplitDataForFrontend.split_houses()


def run_houses_only():
    """Rebuild only the house groupings and their frontend payloads."""
    BuildHouses.build_houses()
    SplitDataForFrontend.split_houses()


def run_deep_ancestors(monarchies):
    """Fetch the deep Mongol-house lineages, fold them in, and rebuild houses.

    Layers onto an already-built dataset (no succession rebuild): gathers the
    intermediate paternal ancestors that connect the khanates to Genghis Khan,
    labels and folds them into monarchy_data.json, then rebuilds the house
    payloads so e.g. Borjigin collapses from disconnected sub-trees into one tree.
    """
    GatherAncestors.gather_deep_ancestors(monarchies)
    GetData.label_people(monarchies)
    GatherAncestors.combine_ancestors(monarchies)
    BuildHouses.build_houses()
    SplitDataForFrontend.split()
    SplitDataForFrontend.split_houses()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("monarchies", nargs="*", help="Monarchies to (re)build, e.g. England France.")
    parser.add_argument("--all", action="store_true", help="Build every known monarchy.")
    parser.add_argument("--skip-lists", action="store_true",
                        help="Skip the Wikipedia scraping stage and reuse data/monarch_list.json.")
    parser.add_argument("--skip-ancestors", action="store_true",
                        help="Skip the additive common-ancestor gather stage.")
    parser.add_argument("--ancestors-only", action="store_true",
                        help="Only layer common-ancestor data onto the existing built dataset "
                             "(no succession rebuild).")
    parser.add_argument("--split-only", action="store_true",
                        help="Only regenerate public/royalty/ from the existing combined files.")
    parser.add_argument("--houses-only", action="store_true",
                        help="Only rebuild the house groupings and their frontend payloads.")
    parser.add_argument("--deep-ancestors", action="store_true",
                        help="Fetch the deep Mongol-house lineages (khanates -> Genghis Khan), "
                             "fold them into the combined data, and rebuild houses.")
    args = parser.parse_args()

    if args.houses_only:
        run_houses_only()
        return

    if args.deep_ancestors:
        deep = args.monarchies or sorted(GatherAncestors.DEEP_ANCESTOR_MONARCHIES)
        run_deep_ancestors(deep)
        return

    if args.split_only:
        SplitDataForFrontend.split()
        SplitDataForFrontend.split_houses()
        return

    monarchies = ALL_MONARCHIES if args.all else args.monarchies
    if not monarchies:
        parser.error("specify one or more monarchies, or --all (or use --split-only).")

    unknown = [m for m in monarchies if m not in ALL_MONARCHIES]
    if unknown:
        parser.error(f"unknown monarchies: {unknown}. Known: {ALL_MONARCHIES}")

    if args.ancestors_only:
        run_ancestors_only(monarchies)
        return

    run(monarchies, skip_lists=args.skip_lists, with_ancestors=not args.skip_ancestors)


if __name__ == "__main__":
    main()
