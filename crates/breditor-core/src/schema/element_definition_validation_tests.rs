//! Regression coverage for borrowing one definition during an element visit.

use std::error::Error;

use crate::{
    document::{ElementNode, NodeRef, PropertyMap, PropertyValue},
    identity::{EntityId, QualifiedName},
    position::NodePath,
    schema::{CompiledSchema, DocumentLimits, ValidationCode, ValidationDetail, ValidationSubject},
};

#[test]
fn unknown_element_still_checks_its_properties_identity_and_descendants()
-> Result<(), Box<dyn Error>> {
    use ValidationCode::{
        DuplicateEntityId, EntityIdForbidden, InvalidChild, PropertiesNotAllowed, UnknownElement,
    };
    use ValidationSubject::{Child, ElementKind, EntityId as IdentitySubject, Node};

    let schema = CompiledSchema::breditor_base();
    let properties = PropertyMap::try_from_sorted(vec![(
        QualifiedName::try_new("example/value")?,
        PropertyValue::from_string("value"),
    )])?;
    let identity = EntityId::try_new("same-identity")?;
    let child = NodeRef::element(ElementNode::try_new(
        QualifiedName::try_new("breditor/paragraph")?,
        Some(identity.clone()),
        properties.clone(),
        vec![],
    )?);
    let unknown = NodeRef::element(ElementNode::try_new(
        QualifiedName::try_new("example/unknown")?,
        Some(identity),
        properties,
        vec![child],
    )?);
    let root = NodeRef::element(ElementNode::try_new(
        schema.root_kind().clone(),
        None,
        PropertyMap::default(),
        vec![unknown],
    )?);
    let report = schema
        .validate_root(&root, &DocumentLimits::default())
        .err()
        .ok_or("invalid tree was admitted")?;
    let actual: Vec<_> = report
        .iter()
        .map(|issue| {
            (issue.code(), issue.path().to_vec(), issue.subject().clone(), issue.detail().clone())
        })
        .collect();
    assert_eq!(
        actual,
        vec![
            (InvalidChild, vec![], Child { index: 0 }, ValidationDetail::None),
            (PropertiesNotAllowed, vec![0], Node, ValidationDetail::None),
            (UnknownElement, vec![0], ElementKind, ValidationDetail::None),
            (EntityIdForbidden, vec![0], IdentitySubject, ValidationDetail::None),
            (PropertiesNotAllowed, vec![0, 0], Node, ValidationDetail::None),
            (EntityIdForbidden, vec![0, 0], IdentitySubject, ValidationDetail::None),
            (
                DuplicateEntityId,
                vec![0, 0],
                IdentitySubject,
                ValidationDetail::DuplicateEntityId {
                    first_path: NodePath::try_from_indices(vec![0])?,
                }
            ),
        ]
    );
    Ok(())
}
