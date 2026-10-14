//! Closed element-property validation, after the shared resource-budget walk.

use std::sync::Arc;

use crate::{
    document::{ElementNode, PropertyValueKind},
    identity::QualifiedName,
    position::NodePathCursor,
    schema::element_property_contract::RequiredIntegerProperty,
};

use super::{
    IntegerRangeViolation, ValidationCode, ValidationDetail, ValidationState, ValidationSubject,
};

impl ValidationState<'_> {
    pub(super) fn validate_element_property_contract(
        &mut self,
        element: &ElementNode,
        path: &NodePathCursor,
        contract: Option<&RequiredIntegerProperty>,
    ) {
        let Some(contract) = contract else { return };
        match element.properties().get(&contract.name) {
            None => self.element_property_issue(
                ValidationCode::MissingRequiredElementProperty,
                path,
                &contract.name,
                ValidationDetail::None,
                "required element property is missing",
            ),
            Some(value) => {
                if let Some(integer) = value.as_integer() {
                    let violation = if integer < contract.minimum {
                        Some(IntegerRangeViolation::BelowMinimum)
                    } else if integer > contract.maximum {
                        Some(IntegerRangeViolation::AboveMaximum)
                    } else {
                        None
                    };
                    if let Some(violation) = violation {
                        self.element_property_issue(
                            ValidationCode::ElementPropertyIntegerOutOfRange,
                            path,
                            &contract.name,
                            ValidationDetail::ElementPropertyIntegerRange {
                                minimum: contract.minimum,
                                maximum: contract.maximum,
                                violation,
                            },
                            "element integer property is outside its declared range",
                        );
                    } else if contract.child_ordinals
                        && !crate::schema::element_property_contract::child_ordinals_fit(
                            integer.get(),
                            element.children().len(),
                            contract.maximum.get(),
                        )
                    {
                        self.element_property_issue(
                            ValidationCode::ElementChildOrdinalOutOfRange,
                            path,
                            &contract.name,
                            ValidationDetail::None,
                            "final child ordinal exceeds the declared integer ceiling",
                        );
                    }
                } else {
                    self.element_property_issue(
                        ValidationCode::ElementPropertyTypeMismatch,
                        path,
                        &contract.name,
                        ValidationDetail::ElementPropertyType {
                            expected: PropertyValueKind::Integer,
                            actual: value.kind(),
                        },
                        "element property must be an integer",
                    );
                }
            }
        }
        for (name, _) in element.properties().iter().take(self.limits.max_properties_per_owner) {
            if self.report_is_saturated() {
                return;
            }
            if name != &contract.name {
                self.element_property_issue(
                    ValidationCode::UnknownElementProperty,
                    path,
                    name,
                    ValidationDetail::None,
                    "element has an undeclared property",
                );
            }
        }
    }

    pub(super) fn element_property_issue(
        &mut self,
        code: ValidationCode,
        path: &NodePathCursor,
        name: &QualifiedName,
        detail: ValidationDetail,
        message: &str,
    ) {
        self.issue(
            code,
            path,
            ValidationSubject::ElementProperty {
                name: Arc::from(name.as_str()),
                value_path: Arc::from([]),
            },
            detail,
            message.to_owned(),
        );
    }
}
