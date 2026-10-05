//! Coordinate and shape admission laws for reused flat-list block paths.
use super::{FlatListTextReplaceError, absolute_paths, offset_paths};
use crate::{
    document::{ElementNode, NodeRef, PropertyMap},
    identity::QualifiedName,
    position::NodePath,
};
use std::error::Error;

fn element(kind: &str, children: Vec<NodeRef>) -> Result<NodeRef, Box<dyn Error>> {
    Ok(NodeRef::element(ElementNode::try_new(
        QualifiedName::try_new(kind)?,
        None,
        PropertyMap::default(),
        children,
    )?))
}

#[test]
fn reused_paths_match_independent_coordinate_oracle() -> Result<(), Box<dyn Error>> {
    let indices = [vec![0], vec![1, 0, 0], vec![1, 499, 0], vec![2]];
    let paths =
        indices.iter().cloned().map(NodePath::try_from_indices).collect::<Result<Vec<_>, _>>()?;
    for start in [0, 1, 17, u32::MAX - 2] {
        let actual = offset_paths(paths.iter(), start)?;
        let expected = indices
            .iter()
            .map(|indices| {
                let mut indices = indices.clone();
                indices[0] += start;
                NodePath::try_from_indices(indices)
            })
            .collect::<Result<Vec<_>, _>>()?;
        assert_eq!(actual.as_ref(), expected);
    }
    for start in [u32::MAX - 1, u32::MAX] {
        assert_eq!(offset_paths(paths.iter(), start), Err(FlatListTextReplaceError::InvalidTarget));
    }
    assert_eq!(paths[2].to_vec(), vec![1, 499, 0]);
    Ok(())
}

#[test]
fn absolute_paths_keep_shape_admission_and_document_order() -> Result<(), Box<dyn Error>> {
    let paragraph = element("breditor/paragraph", vec![])?;
    let item = element("breditor/list-item", vec![paragraph.clone()])?;
    let list = element("breditor/bullet-list", vec![item.clone(), item])?;
    let roots = vec![paragraph.clone(), list, paragraph.clone()];
    for start in [0, 3] {
        let actual = absolute_paths(&roots, start)?;
        assert_eq!(
            actual.iter().map(NodePath::to_vec).collect::<Vec<_>>(),
            vec![vec![start], vec![start + 1, 0, 0], vec![start + 1, 1, 0], vec![start + 2]],
        );
    }
    for invalid in [
        element("breditor/bullet-list", vec![])?,
        element("breditor/bullet-list", vec![paragraph.clone()])?,
        element("breditor/bullet-list", vec![element("breditor/list-item", vec![])?])?,
        element(
            "breditor/bullet-list",
            vec![element("breditor/list-item", vec![paragraph.clone(), paragraph])?],
        )?,
    ] {
        assert_eq!(absolute_paths(&[invalid], 0), Err(FlatListTextReplaceError::InvalidTarget));
    }
    Ok(())
}
