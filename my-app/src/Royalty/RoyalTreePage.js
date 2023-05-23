import React, { useMemo, useState, useCallback } from 'react';
import ROYAL_TREE from './royaltree_fixed.json';
import TEST_TREE from './average-tree.json';
import treePackage from 'relatives-tree/package.json';
import ReactFamilyTree from 'react-family-tree';
import { PinchZoomPan } from './PinchZoomPan/PinchZoomPan';
import { FamilyNode } from './FamilyNode/FamilyNode';
import { NodeDetails } from './NodeDetails/NodeDetails';

import css from './RoyalTreePage.module.css';

const NODE_WIDTH = 70;
const NODE_HEIGHT = 80;

function getNodeStyle({ left, top }) {
  return {
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    transform: `translate(${left * (NODE_WIDTH / 2)}px, ${top * (NODE_HEIGHT / 2)}px)`,
  };
}

function getFirstNEntries(obj, n) {
  const entries = Object.entries(obj).slice(0, n);
  const result = {};

  for (const [key, value] of entries) {
    result[key] = value;
  }

  return result;
}

function convertToGraph(data) {
  const nodeSet = {}
  const nodes = Object.values(data).map(person => {
    const node = {
      id: person.id,
      gender: person.sex ? person.sex :  null,
      parents: [],
      children: [],
      siblings: [],
      spouses: []
    };
    if (person['mother'] && data[person['mother']]){
      node['parents'].push({ id: person['mother'], type: "blood" })
    }
    if (person['father'] && data[person['father']]){
      node['parents'].push({ id: person['father'], type: "blood" })
    }
    if (person['issueList']){
      node['children'] = person['issueList'].filter(childId => data[childId])
          .map(childId => { return { id: childId, type: "blood" } })
    }
    if (person['spouseList']){
      node['spouses'] = person['spouseList'].filter(spouseId => data[spouseId])
          .map(spouseId => { return { id: spouseId, type: "married" } })
    }
    return node;
  });
  console.log(nodes);
  return nodes;
}

export default React.memo(function Royal() {
  // const [source, setSource] = useState(DEFAULT_SOURCE);
  const [nodes, setNodes] = useState(convertToGraph(getFirstNEntries(ROYAL_TREE, 100)));
  // const [nodes, setNodes] = useState(TEST_TREE);

  const firstNodeId = useMemo(() => nodes[0].id, [nodes]);
  const [rootId, setRootId] = useState(firstNodeId);

  const [selectId, setSelectId] = useState();
  const [hoverId, setHoverId] = useState();

  const resetRootHandler = useCallback(() => setRootId(firstNodeId), [firstNodeId]);

  // const changeSourceHandler = useCallback((value, nodes) => {
  //   setRootId(nodes[0].id);
  //   setNodes(nodes);
  //   setSource(value);
  //   setSelectId(undefined);
  //   setHoverId(undefined);
  // }, []);

  const selected = useMemo(() => nodes.find(item => item.id === selectId), [nodes, selectId]);

      return (
          <div className={css.root}>
            <header className={css.header}>
              <h1 className={css.title}>
                FamilyTree demo
                <span className={css.version}>
              core: {treePackage.version}
            </span>
              </h1>

              {/*<div>*/}
              {/*  <label>Source: </label>*/}
              {/*  <SourceSelect value={source} items={SOURCES} onChange={changeSourceHandler} />*/}
              {/*</div>*/}

              <a href="https://github.com/SanichKotikov/react-family-tree-example">GitHub</a>
            </header>
            {nodes.length > 0 && (
                <PinchZoomPan min={0.5} max={2.5} captureWheel className={css.wrapper}>
                  <ReactFamilyTree
                      nodes={nodes}
                      rootId={rootId}
                      width={NODE_WIDTH}
                      height={NODE_HEIGHT}
                      className={css.tree}
                      renderNode={(node) => (
                          <FamilyNode
                              key={node.id}
                              node={node}
                              isRoot={node.id === rootId}
                              isHover={node.id === hoverId}
                              onClick={setSelectId}
                              onSubClick={setRootId}
                              style={getNodeStyle(node)}
                          />
                      )}
                  />
                </PinchZoomPan>
            )}
            {rootId !== firstNodeId && (
                <button className={css.reset} onClick={resetRootHandler}>
                  Reset
                </button>
            )}
            {selected && (
                <NodeDetails
                    node={selected}
                    className={css.details}
                    onSelect={setSelectId}
                    onHover={setHoverId}
                    onClear={() => setHoverId(undefined)}
                />
            )}
          </div>
      );
    },
);