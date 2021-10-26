#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';

import * as ec2 from "@aws-cdk/aws-ec2";
import * as ecs from "@aws-cdk/aws-ecs";
import * as cr from "@aws-cdk/custom-resources";

class FargateStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, sha: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const taskDefinitionArn = process.env.TASK_DEFINITION_ARN;

        if (!taskDefinitionArn) {
            throw new Error('TASK_DEFINITION_ARN environment variable is missing');
        }

        cdk.Tags.of(this).add('FargateStack', id);

        const vpc = new ec2.Vpc(this, appendPostfix("ecs-vpc"), {
            natGateways: 0,
            subnetConfiguration: [
                {
                    name: appendPostfix('public-subnet'),
                    subnetType: ec2.SubnetType.PUBLIC
                }
            ]
        });

        const cluster = new ecs.Cluster(this, appendPostfix("Cluster"), {
            vpc: vpc
        });

        const securityGroupName = appendPostfix("securityGroup");
        const securityGroup = new ec2.SecurityGroup(this, securityGroupName, {
            allowAllOutbound: true,
            securityGroupName: securityGroupName,
            vpc: vpc
        });
        securityGroup.connections.allowFromAnyIpv4(ec2.Port.tcp(80));

        // Dummy task definition, will be replaced by ARN of the existing task definition
        const dummyTaskDefinition = new ecs.TaskDefinition(this, "dummyTask", {
                compatibility: ecs.Compatibility.FARGATE,
                cpu: "256",
                memoryMiB: "512",
            }
        );
        dummyTaskDefinition.addContainer("dummyContainer", {
            image: ecs.ContainerImage.fromRegistry("dummyImage"),
        });

        const service = new ecs.FargateService(this, "service", {
            cluster,
            desiredCount: 1,
            taskDefinition: dummyTaskDefinition,
            securityGroups: [securityGroup],
            assignPublicIp: true
        });

        const taskName = createCustomResource(this, "taskName", "ECS", "listTasks", "taskArns.0", {
            "cluster": cluster.clusterArn
        });

        const eniId = createCustomResource(this, "eniId", "ECS", "describeTasks", "tasks.0.attachments.0.details.1.value", {
            "cluster": cluster.clusterArn,
            "tasks": [taskName.getResponseField("taskArns.0")]
        });

        const publicIp = createCustomResource(this, "publicIp", "EC2", "describeNetworkInterfaces", "NetworkInterfaces.0.Association.PublicIp", {
            NetworkInterfaceIds: [
                eniId.getResponseField("tasks.0.attachments.0.details.1.value")
            ]
        });

        new cdk.CfnOutput(this, 'publicIp', {
            value: publicIp.getResponseField("NetworkInterfaces.0.Association.PublicIp")
        });

        // https://github.com/aws/aws-cdk/issues/6240
        (service.node.tryFindChild("Service") as ecs.CfnService)?.addPropertyOverride(
            "TaskDefinition",
            taskDefinitionArn
        );

        function appendPostfix(name: string): string {
            return `${name}-${sha}`;
        }

        function createCustomResource(scope: cdk.Construct, name: string, service: string, action: string, path: string, parameters?: any): cr.AwsCustomResource {
            return new cr.AwsCustomResource(
                scope,
                appendPostfix(name),
                {
                    onCreate: {
                        service: service,
                        action: action,
                        outputPaths: [path],
                        parameters: parameters,
                        physicalResourceId: cr.PhysicalResourceId.fromResponse(path)
                    },
                    policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
                        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
                    })
                }
            );
        }
    }
}

const app = new cdk.App();

const time = new Date().getTime();

const cdkStackName = process.env.CDK_STACK_NAME;
if (!cdkStackName) {
    throw new Error('CDK_STACK_NAME environment variable is missing');
}

const cdkStackSha = process.env.CDK_STACK_SHA;
if (!cdkStackSha) {
    throw new Error('CDK_STACK_SHA environment variable is missing');
}

new FargateStack(app, `${cdkStackName}-${cdkStackSha}`, cdkStackSha, {
    /* If you don't specify 'env', this stack will be environment-agnostic.
     * Account/Region-dependent features and context lookups will not work,
     * but a single synthesized template can be deployed anywhere. */

    /* Uncomment the next line to specialize this stack for the AWS Account
     * and Region that are implied by the current CLI configuration. */
    // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

    /* Uncomment the next line if you know exactly what Account and Region you
     * want to deploy the stack to. */
    // env: { account: '123456789012', region: 'us-east-1' },

    /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});
